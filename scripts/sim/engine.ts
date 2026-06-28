/**
 * Pure, parameterized re-implementation of the pool's scoring, faithful to the
 * SQL views (supabase/migrations/0003_scoring.sql + 0014_gc_mains_only.sql):
 *
 *   - stage points: sum of stagePoints[position] over a team's ACTIVE riders in
 *     each stage. Active = main picks that matched and hadn't dropped, plus
 *     reserve substitutes (in reserve_order) filling vacated slots — but only
 *     for stages <= reserveLockStage.
 *   - GC points: sum of gcPoints[position]; mains only when gcMainsOnly.
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
  /** reserves may substitute only for stages with number <= this (current: 6) */
  reserveLockStage: number;
  /** when true, only main (non-reserve) riders earn final-GC points (current: true) */
  gcMainsOnly: boolean;
  /** when true, reserves ALWAYS score stage points (not just as substitutes). default false. */
  reservesScoreAllStages?: boolean;
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
 * Resolve which rider_ids are active for a team at a given stage, mirroring the
 * team_active_riders() plpgsql function.
 */
function activeRidersForStage(
  teamId: string,
  stage: number,
  snap: Snapshot,
  rules: RuleSet,
  dropoutByRider: Map<string, number>,
): string[] {
  const picks = snap.teamRiders.filter((tr) => tr.team_id === teamId);
  const mains = picks.filter((p) => !p.is_reserve);
  const reserves = picks
    .filter((p) => p.is_reserve)
    .sort((a, b) => (a.reserve_order ?? 0) - (b.reserve_order ?? 0));

  const isActive = (rider_id: string | null, status: string): boolean => {
    if (UNRESOLVED.has(status)) return false;
    if (!rider_id) return false;
    const dropAfter = dropoutByRider.get(rider_id);
    if (dropAfter !== undefined && dropAfter < stage) return false;
    return true;
  };

  const active: string[] = [];
  let slotsNeeded = 0;
  for (const m of mains) {
    if (isActive(m.rider_id, m.match_status)) active.push(m.rider_id as string);
    else slotsNeeded++;
  }

  // Reserve substitution only applies through reserveLockStage.
  if (stage <= rules.reserveLockStage && slotsNeeded > 0) {
    let filled = 0;
    for (const r of reserves) {
      if (filled >= slotsNeeded) break;
      if (isActive(r.rider_id, r.match_status)) {
        active.push(r.rider_id as string);
        filled++;
      }
    }
  }
  return active;
}

export function score(snap: Snapshot, rules: RuleSet): TeamScore[] {
  const dropoutByRider = new Map<string, number>();
  for (const d of snap.dropouts) dropoutByRider.set(d.rider_id, d.dropout_after_stage);

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

    let stagePoints = 0;
    for (const stage of stages) {
      const positions = posByStageRider.get(stage);
      if (!positions) continue;
      const active = new Set(
        activeRidersForStage(t.id, stage, snap, rules, dropoutByRider),
      );
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
        stagePoints += rules.stagePoints[pos] ?? 0;
        if (pos === 1) stagePoints += rules.stageWinBonus ?? 0;
      }
    }

    // GC
    let gcPoints = 0;
    const gcPicks = rules.gcMainsOnly ? picks.filter((p) => !p.is_reserve) : picks;
    for (const p of gcPicks) {
      if (!p.rider_id) continue;
      const pos = gcPos.get(p.rider_id);
      if (pos !== undefined) gcPoints += rules.gcPoints[pos] ?? 0;
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
  gcMainsOnly: true,
};
