/**
 * Pure, parameterized re-implementation of the pool's scoring, faithful to the
 * SQL views (supabase/migrations/0003_scoring.sql + 0014_gc_mains_only.sql):
 *
 *   - stage points: sum of stagePoints[position] over a team's ACTIVE riders in
 *     each stage. Active = main picks that matched and hadn't dropped, plus
 *     reserve substitutes (in reserve_order) filling vacated slots — but only
 *     for stages <= reserveLockStage.
 *   - GC points: sum of gcPoints[position] over the FINAL roster (stage-21
 *     survivors + subbed-in reserves), mains-only when gcMainsOnly is set.
 *
 * Everything that varies between rule proposals lives in RuleSet, so the same
 * 2025 snapshot can be scored under any number of scenarios.
 */

/** Secondary classifications we can score if standings are supplied. */
export type Jersey = "green" | "polka" | "white" | "combativity";

export interface RuleSet {
  name: string;
  /** position (1-based) -> points awarded for finishing there in a stage */
  stagePoints: Record<number, number>;
  /** position (1-based) -> points awarded for that final-GC placing */
  gcPoints: Record<number, number>;

  // ---- Bonus / jersey levers (all optional; omit = off, preserves current rules) ----
  /** extra points when one of your active riders WINS a stage (finishes 1st), on
   *  top of the stage table. e.g. 5 = a stage win is worth stagePoints[1] + 5. */
  stageWinBonus?: number;
  /** points for FINAL standings in secondary jerseys. Per jersey: position -> points.
   *  Requires snapshot.jerseys[<jersey>] to be populated. */
  jerseyPoints?: Partial<Record<Jersey, Record<number, number>>>;
  /** when true, only main riders earn jersey points (mirrors gcMainsOnly). default true. */
  jerseyMainsOnly?: boolean;

  // ---- Reserve / roster levers ----
  /** reserves may substitute only for stages with number <= this (current: 6, 2026: 10) */
  reserveLockStage: number;
  /** GC always scores the FINAL roster (surviving mains + subbed-in reserves) —
   *  that's the real rule (v_team_gc_points). Set this true only to run a
   *  what-if scenario where subbed-in reserves are denied GC credit. Default/
   *  current behavior is false. */
  gcMainsOnly: boolean;
  /** when true, reserves ALWAYS score stage points (not just as substitutes). default false. */
  reservesScoreAllStages?: boolean;

  // ---- 2026-era levers (all optional; omit = off, preserves current rules) ----
  /** when true, add each stage's stage_youth_bonus.bonus_points for active riders
   *  (mirrors v_team_stage_points, migration 0021 — the tiered white-jersey bonus). */
  youthBonusEnabled?: boolean;
  /** per-stage bonus for owning the rider who holds a classification's jersey THAT
   *  STAGE (snapshot.stageJerseyLeaders), keyed by the DB's classification code:
   *  'points' = green, 'mountain' = polka, 'youth_leader' = white, 'gc' = yellow.
   *  Distinct from `jerseyPoints`, which pays the FINAL standings once. */
  jerseyStageBonusPoints?: Partial<Record<string, number>>;
  /** flat bonus added on top of a scoring event (stage placement or final-GC
   *  points) when the scoring rider is drafted as a MAIN by exactly one team
   *  pool-wide (see riderOwnershipCounts). Rewards distinctive drafting. */
  uniqueRiderBonusPoints?: number;
}

export interface Snapshot {
  year: number;
  poolId: string;
  teams: { id: string; name: string; player_name: string | null }[];
  teamRiders: {
    team_id: string;
    rider_id: string | null;
    is_reserve: boolean;
    reserve_order: number | null;
    pick_order: number | null;
    match_status: string;
    raw_name: string;
  }[];
  stageResults: { stage: number; position: number; rider_id: string | null }[];
  finalGc: { position: number; rider_id: string | null }[];
  dropouts: { rider_id: string; dropout_after_stage: number }[];
  riderNames: Record<string, string>;
  /** final standings for secondary jerseys, populated from authoritative sources
   *  (not in the DB). Optional — scenarios that don't use jerseys ignore it. */
  jerseys?: Partial<Record<Jersey, { position: number; rider_id: string | null }[]>>;
  /** per-stage tiered youth-jersey bonus, straight from stage_youth_bonus. */
  stageYouthBonus?: { stage: number; rider_id: string; bonus_points: number }[];
  /** per-stage classification leaders, straight from stage_jersey_leaders
   *  (classification: 'gc' | 'points' | 'mountain' | 'youth_leader'). */
  stageJerseyLeaders?: { stage: number; classification: string; rider_id: string | null }[];
}

export interface TeamScore {
  teamId: string;
  name: string;
  player: string | null;
  stagePoints: number;
  gcPoints: number;
  total: number;
  rank: number;
}

const UNRESOLVED = new Set(["unmatched", "ambiguous"]);

/**
 * Per-team substitution plan, mirroring team_active_riders() (migration 0029)
 * EXACTLY: vacancies (mains who left before reserveLockStage, sorted by
 * out_after then pick_order) are paired 1:1, in that order, with eligible
 * reserves (matched, and themselves still riding at reserveLockStage, sorted
 * by reserve_order) — a permanent pairing, not a day-by-day "any active
 * reserve fills any open slot" heuristic (which silently promotes the wrong
 * reserve when more than one main has dropped).
 */
export function buildTeamActivePlan(
  teamId: string,
  snap: Snapshot,
  rules: RuleSet,
  dropoutByRider: Map<string, number>,
): (stage: number) => string[] {
  const picks = snap.teamRiders.filter((tr) => tr.team_id === teamId);

  // Historical mode (mirrors 0028/0029): a pool with zero dropout records has
  // no substitution tracking — every matched pick scores every stage.
  if (snap.dropouts.length === 0) {
    const ids = picks
      .filter((p) => p.rider_id && !UNRESOLVED.has(p.match_status))
      .map((p) => p.rider_id as string);
    return () => ids;
  }

  const outAfter = (riderId: string | null, status: string): number => {
    if (UNRESOLVED.has(status) || !riderId) return 0;
    return dropoutByRider.get(riderId) ?? 99;
  };

  const vLock = rules.reserveLockStage;

  const mains = picks
    .filter((p) => !p.is_reserve)
    .map((p, idx) => ({
      riderId: p.rider_id,
      pickOrder: p.pick_order ?? idx,
      outAfter: outAfter(p.rider_id, p.match_status),
    }));

  const vacancies = mains
    .filter((m) => m.outAfter < vLock)
    .sort((a, b) => a.outAfter - b.outAfter || a.pickOrder - b.pickOrder);

  const eligibleReserves = picks
    .filter((p) => p.is_reserve && p.rider_id && !UNRESOLVED.has(p.match_status))
    .map((p) => ({
      riderId: p.rider_id as string,
      reserveOrder: p.reserve_order ?? 0,
      outAfter: outAfter(p.rider_id, p.match_status),
    }))
    .filter((r) => r.outAfter >= vLock)
    .sort((a, b) => a.reserveOrder - b.reserveOrder);

  const subs = vacancies
    .map((v, i) => {
      const r = eligibleReserves[i];
      return r ? { riderId: r.riderId, joinAfter: v.outAfter, resOut: r.outAfter } : null;
    })
    .filter((s): s is { riderId: string; joinAfter: number; resOut: number } => s !== null);

  return (stage: number): string[] => {
    const active: string[] = [];
    for (const m of mains) if (m.riderId && m.outAfter >= stage) active.push(m.riderId);
    for (const s of subs) if (stage > s.joinAfter && s.resOut >= stage) active.push(s.riderId);
    return active;
  };
}

/**
 * How many distinct teams drafted each rider as a MAIN (resolved picks only).
 * Used by uniqueRiderBonusPoints — a rider owned by exactly one team is "unique".
 */
export function riderOwnershipCounts(snap: Snapshot): Map<string, number> {
  const counts = new Map<string, Set<string>>();
  for (const p of snap.teamRiders) {
    if (p.is_reserve || !p.rider_id || UNRESOLVED.has(p.match_status)) continue;
    if (!counts.has(p.rider_id)) counts.set(p.rider_id, new Set());
    counts.get(p.rider_id)!.add(p.team_id);
  }
  const out = new Map<string, number>();
  for (const [riderId, teams] of counts) out.set(riderId, teams.size);
  return out;
}

export function score(snap: Snapshot, rules: RuleSet): TeamScore[] {
  const dropoutByRider = new Map<string, number>();
  for (const d of snap.dropouts) dropoutByRider.set(d.rider_id, d.dropout_after_stage);

  // stage -> rider_id -> bonus_points (tiered white-jersey bonus, migration 0021)
  const youthBonusByStageRider = new Map<number, Map<string, number>>();
  for (const b of snap.stageYouthBonus ?? []) {
    if (!youthBonusByStageRider.has(b.stage)) youthBonusByStageRider.set(b.stage, new Map());
    youthBonusByStageRider.get(b.stage)!.set(b.rider_id, b.bonus_points);
  }

  // stage -> classification -> rider_id holding that jersey after the stage
  const jerseyLeaderByStage = new Map<number, Map<string, string>>();
  for (const j of snap.stageJerseyLeaders ?? []) {
    if (!j.rider_id) continue;
    if (!jerseyLeaderByStage.has(j.stage)) jerseyLeaderByStage.set(j.stage, new Map());
    jerseyLeaderByStage.get(j.stage)!.set(j.classification, j.rider_id);
  }

  const ownership = rules.uniqueRiderBonusPoints ? riderOwnershipCounts(snap) : null;
  const isUnique = (riderId: string) => (ownership?.get(riderId) ?? 0) === 1;

  // Index stage results: stage -> (rider_id -> position)
  const stages = Array.from(new Set(snap.stageResults.map((r) => r.stage))).sort(
    (a, b) => a - b,
  );
  const posByStageRider = new Map<number, Map<string, number>>();
  for (const r of snap.stageResults) {
    if (!r.rider_id) continue;
    if (!posByStageRider.has(r.stage)) posByStageRider.set(r.stage, new Map());
    posByStageRider.get(r.stage)!.set(r.rider_id, r.position);
  }

  // Final GC: rider_id -> position
  const gcPos = new Map<string, number>();
  for (const r of snap.finalGc) if (r.rider_id) gcPos.set(r.rider_id, r.position);

  // Jersey final standings: jersey -> (rider_id -> position)
  const jerseyPos: Partial<Record<Jersey, Map<string, number>>> = {};
  for (const [jersey, rows] of Object.entries(snap.jerseys ?? {})) {
    const m = new Map<string, number>();
    for (const r of rows) if (r.rider_id) m.set(r.rider_id, r.position);
    jerseyPos[jersey as Jersey] = m;
  }

  const scores: TeamScore[] = [];
  for (const t of snap.teams) {
    const picks = snap.teamRiders.filter((tr) => tr.team_id === t.id);
    const activePlan = buildTeamActivePlan(t.id, snap, rules, dropoutByRider);

    let stagePoints = 0;
    for (const stage of stages) {
      const positions = posByStageRider.get(stage);
      if (!positions) continue;
      const active = new Set(activePlan(stage));
      // Optionally let reserves always score stage points too.
      if (rules.reservesScoreAllStages) {
        for (const p of picks) {
          if (p.is_reserve && p.rider_id && !UNRESOLVED.has(p.match_status))
            active.add(p.rider_id);
        }
      }
      for (const rid of active) {
        const pos = positions.get(rid);
        if (pos === undefined) continue;
        const base = rules.stagePoints[pos] ?? 0;
        stagePoints += base;
        if (pos === 1) stagePoints += rules.stageWinBonus ?? 0;
        if (base > 0 && rules.uniqueRiderBonusPoints && isUnique(rid)) {
          stagePoints += rules.uniqueRiderBonusPoints;
        }
      }

      if (rules.youthBonusEnabled) {
        const bonuses = youthBonusByStageRider.get(stage);
        if (bonuses) for (const rid of active) stagePoints += bonuses.get(rid) ?? 0;
      }

      if (rules.jerseyStageBonusPoints) {
        const leaders = jerseyLeaderByStage.get(stage);
        if (leaders) {
          for (const [classification, pts] of Object.entries(rules.jerseyStageBonusPoints)) {
            const leaderId = leaders.get(classification);
            if (leaderId && active.has(leaderId)) stagePoints += pts ?? 0;
          }
        }
      }
    }

    // GC: the FINAL roster at stage 21 (surviving mains + subbed-in reserves),
    // mirroring v_team_gc_points' `team_active_riders(t.id, 21)`. Unused bench
    // reserves and dropped mains contribute nothing regardless of gcMainsOnly.
    let gcPoints = 0;
    const finalRosterIds = new Set(activePlan(21));
    const gcPicks = picks.filter(
      (p) => p.rider_id && finalRosterIds.has(p.rider_id) && (!rules.gcMainsOnly || !p.is_reserve),
    );
    for (const p of gcPicks) {
      if (!p.rider_id) continue;
      const pos = gcPos.get(p.rider_id);
      if (pos === undefined) continue;
      const base = rules.gcPoints[pos] ?? 0;
      gcPoints += base;
      if (base > 0 && rules.uniqueRiderBonusPoints && isUnique(p.rider_id)) {
        gcPoints += rules.uniqueRiderBonusPoints;
      }
    }

    // Secondary jerseys (folded into gcPoints so the leaderboard columns stay simple;
    // can split out later if the family wants a separate column).
    const jerseyMainsOnly = rules.jerseyMainsOnly ?? true;
    const jerseyPicks = jerseyMainsOnly ? picks.filter((p) => !p.is_reserve) : picks;
    for (const [jersey, posMap] of Object.entries(rules.jerseyPoints ?? {})) {
      const standings = jerseyPos[jersey as Jersey];
      if (!standings) continue;
      for (const p of jerseyPicks) {
        if (!p.rider_id) continue;
        const pos = standings.get(p.rider_id);
        if (pos !== undefined) gcPoints += (posMap as Record<number, number>)[pos] ?? 0;
      }
    }

    scores.push({
      teamId: t.id,
      name: t.name,
      player: t.player_name,
      stagePoints,
      gcPoints,
      total: stagePoints + gcPoints,
      rank: 0,
    });
  }

  // Rank by total desc, standard competition ranking (ties share a rank).
  scores.sort((a, b) => b.total - a.total);
  for (let i = 0; i < scores.length; i++) {
    scores[i].rank =
      i > 0 && scores[i].total === scores[i - 1].total ? scores[i - 1].rank : i + 1;
  }
  return scores;
}

/** The currently-deployed house rules — the baseline every scenario compares to. */
export const CURRENT_RULES: RuleSet = {
  name: "Current (2025)",
  stagePoints: { 1: 20, 2: 15, 3: 12, 4: 10, 5: 8, 6: 6, 7: 5, 8: 4, 9: 3, 10: 2 },
  gcPoints: { 1: 100, 2: 80, 3: 60, 4: 40, 5: 30, 6: 25, 7: 20, 8: 18, 9: 16, 10: 15 },
  reserveLockStage: 6,
  gcMainsOnly: false,
};

/** 2026 official rules (Tour 2026.docx): same points tables, reserve lock at
 *  stage 10, plus the tiered youth bonus (migration 0021) turned on. */
export const CURRENT_RULES_2026: RuleSet = {
  ...CURRENT_RULES,
  name: "Current (2026)",
  reserveLockStage: 10,
  youthBonusEnabled: true,
};
