// Live refresh pipeline built on letour.fr (lib/scraper/letour.ts) — the
// replacement for the Cloudflare-blocked PCS path, for the CURRENT edition.
//
// It pulls every completed stage + the GC + the withdrawals, seeds the riders
// table from the result names (letour gives full names), and resolves rider_ids
// for results and team picks via the shared matcher. Frozen pools are skipped.
//
// The supabase client is injected so this runs from the cron (createServiceClient)
// and from a test script (a plain service-role client) alike. Data fetchers are
// validated against 2025; this orchestration goes live when a 2026 pool exists.

import { matchRider, type RiderRow } from "@/lib/scoring/canonical-match";
import { lastNameOf } from "@/lib/scraper/pcs";
import {
  fetchLetourGc,
  fetchLetourStage,
  fetchLetourStageJerseys,
  fetchLetourStageWithTTT,
  fetchLetourWithdrawals,
} from "@/lib/scraper/letour";

// Minimal shape we need — compatible with both supabase clients.
type Db = {
  from: (t: string) => any;
};

export type LiveRefreshSummary = {
  year: number;
  stages_fetched: number[];
  gc_rows: number;
  withdrawals: number;
  riders_seeded: number;
  picks_resolved: number;
  jersey_stages: number[];
  errors: string[];
};

export async function refreshLive(
  supabase: Db,
  year: number,
  opts: { maxStages?: number } = {},
): Promise<LiveRefreshSummary> {
  const maxStages = opts.maxStages ?? 21;
  const summary: LiveRefreshSummary = {
    year,
    stages_fetched: [],
    gc_rows: 0,
    withdrawals: 0,
    riders_seeded: 0,
    picks_resolved: 0,
    jersey_stages: [],
    errors: [],
  };

  const { data: pool } = await supabase
    .from("pools")
    .select("id, frozen, start_date")
    .eq("year", year)
    .maybeSingle();
  if (!pool) {
    summary.errors.push(`No pool for ${year}`);
    return summary;
  }
  // Don't pull before the race starts. letour.fr serves the PREVIOUS edition's
  // results under the new year's banner until the Tour actually begins, so a
  // pre-race refresh would mislabel last year's data as this year's. Gate on
  // the pool's start_date (set it to this edition's Grand Départ).
  if (!pool.start_date || new Date() < new Date(pool.start_date)) {
    summary.errors.push(
      `Pool ${year} hasn't started (start_date=${pool.start_date ?? "unset"}) — skipped`,
    );
    return summary;
  }
  if (pool.frozen) {
    summary.errors.push(`Pool ${year} is frozen — skipped`);
    return summary;
  }
  const poolId = pool.id as string;

  // Full names harvested from every result/withdrawal row → riders table.
  const harvest = new Map<string, string>(); // full_name → full_name (dedup)
  const addName = (n: string) => {
    const t = n.trim();
    if (t) harvest.set(t.toLowerCase(), t);
  };

  // 1) Stages — fetch sequentially, stop after the first stage with no results
  //    (i.e. not raced yet).
  for (let stage = 1; stage <= maxStages; stage++) {
    let rows;
    try {
      rows = await fetchLetourStageWithTTT(stage);
    } catch (e) {
      summary.errors.push(`stage ${stage}: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    if (rows.length === 0) break; // future stage
    for (const r of rows) addName(r.rider);
    const ups = rows.map((r) => ({
      pool_id: poolId,
      stage,
      position: r.position,
      scoring_position: r.scoring_position ?? null,
      rider_id: null,
      raw_name: r.rider,
    }));
    const { error } = await supabase
      .from("stage_results")
      .upsert(ups, { onConflict: "pool_id,stage,position" });
    if (error) summary.errors.push(`stage ${stage} write: ${error.message}`);
    else summary.stages_fetched.push(stage);
    await new Promise((r) => setTimeout(r, 200));
  }

  // 2) GC (the current classification; becomes final once the Tour ends).
  try {
    const gc = await fetchLetourGc();
    for (const r of gc) addName(r.rider);
    if (gc.length > 0) {
      const ups = gc.map((r) => ({
        pool_id: poolId,
        position: r.position,
        rider_id: null,
        raw_name: r.rider,
      }));
      await supabase.from("final_gc").upsert(ups, { onConflict: "pool_id,position" });
      summary.gc_rows = gc.length;
    }
  } catch (e) {
    summary.errors.push(`gc: ${e instanceof Error ? e.message : e}`);
  }

  // 3) Withdrawals → rider_dropouts (dropout_after_stage = stage - 1).
  let withdrawals: { rider: string; stage: number }[] = [];
  try {
    withdrawals = await fetchLetourWithdrawals();
    for (const w of withdrawals) addName(w.rider);
    summary.withdrawals = withdrawals.length;
  } catch (e) {
    summary.errors.push(`withdrawals: ${e instanceof Error ? e.message : e}`);
  }

  // 4) Seed riders from harvested names (idempotent upsert by pool_id+full_name).
  const seeds = [...harvest.values()].map((full) => ({
    pool_id: poolId,
    full_name: full,
    last_name: lastNameOf(full),
  }));
  if (seeds.length) {
    const { error } = await supabase
      .from("riders")
      .upsert(seeds, { onConflict: "pool_id,full_name", ignoreDuplicates: true });
    if (error) summary.errors.push(`seed riders: ${error.message}`);
    else summary.riders_seeded = seeds.length;
  }

  // Load the (now-seeded) riders for matching.
  const { data: riders } = await supabase
    .from("riders")
    .select("id, full_name, last_name")
    .eq("pool_id", poolId);
  const peloton = (riders ?? []) as RiderRow[];
  const ridByName = new Map(peloton.map((r) => [r.full_name.toLowerCase(), r.id]));

  // 5) rider_dropouts from withdrawals (now that riders exist).
  const drops = new Map<string, number>();
  for (const w of withdrawals) {
    const id = ridByName.get(w.rider.toLowerCase());
    if (!id) continue;
    const after = w.stage - 1;
    const cur = drops.get(id);
    if (cur === undefined || after < cur) drops.set(id, after);
  }
  if (drops.size) {
    await supabase.from("rider_dropouts").delete().eq("pool_id", poolId);
    await supabase.from("rider_dropouts").insert(
      [...drops.entries()].map(([rider_id, dropout_after_stage]) => ({
        pool_id: poolId,
        rider_id,
        dropout_after_stage,
      })),
    );
  }

  // 6) Resolve rider_ids on results + GC, and team picks.
  await resolveColumn(supabase, "stage_results", poolId, peloton, year);
  await resolveColumn(supabase, "final_gc", poolId, peloton, year);
  summary.picks_resolved = await resolveTeamPicks(supabase, poolId, peloton, year);

  // 7) Jersey leaders per stage (drives the white-jersey youth bonus; the other
  //    jerseys are stored as a backup feed). Incremental — only new stages.
  const { data: haveJersey } = await supabase
    .from("stage_jersey_leaders")
    .select("stage")
    .eq("pool_id", poolId);
  const jerseyStages = new Set((haveJersey ?? []).map((r: { stage: number }) => r.stage));
  for (const stage of summary.stages_fetched) {
    if (jerseyStages.has(stage)) continue;
    try {
      const { bestYouthFinisher, holders } = await fetchLetourStageJerseys(stage);
      // 'youth' = the bonus recipient (best young finisher of the stage).
      // The jersey holders are stored as a backup feed; the white-jersey
      // wearer goes under 'youth_leader' to not collide with the bonus row.
      const entries: [string, string | null | undefined][] = [
        ["youth", bestYouthFinisher],
        ["gc", holders.gc],
        ["points", holders.points],
        ["mountain", holders.mountain],
        ["youth_leader", holders.youth],
      ];
      const rows = entries
        .filter((e): e is [string, string] => Boolean(e[1]))
        .map(([classification, name]) => ({
          pool_id: poolId,
          stage,
          classification,
          raw_name: name,
          rider_id: ridByName.get(name.toLowerCase()) ?? null,
        }));
      if (rows.length) {
        await supabase
          .from("stage_jersey_leaders")
          .upsert(rows, { onConflict: "pool_id,stage,classification" });
        summary.jersey_stages.push(stage);
      }
    } catch (e) {
      summary.errors.push(`jerseys stage ${stage}: ${e instanceof Error ? e.message : e}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  return summary;
}

async function resolveColumn(
  supabase: Db,
  table: "stage_results" | "final_gc",
  poolId: string,
  peloton: RiderRow[],
  year: number,
) {
  const { data: rows } = await supabase
    .from(table)
    .select(table === "stage_results" ? "stage, position, raw_name" : "position, raw_name")
    .eq("pool_id", poolId)
    .is("rider_id", null);
  for (const r of rows ?? []) {
    const m = matchRider(r.raw_name, peloton, year);
    if (m.kind !== "matched") continue;
    const q = supabase.from(table).update({ rider_id: m.rider.id }).eq("pool_id", poolId);
    if (table === "stage_results") await q.eq("stage", r.stage).eq("position", r.position);
    else await q.eq("position", r.position);
  }
}

async function resolveTeamPicks(
  supabase: Db,
  poolId: string,
  peloton: RiderRow[],
  year: number,
): Promise<number> {
  const { data: teams } = await supabase.from("teams").select("id").eq("pool_id", poolId);
  const teamIds = (teams ?? []).map((t: { id: string }) => t.id);
  if (!teamIds.length) return 0;
  // Forward-only ratchet: only resolve picks not already matched/manual.
  const { data: picks } = await supabase
    .from("team_riders")
    .select("id, raw_name")
    .in("team_id", teamIds)
    .in("match_status", ["unmatched", "ambiguous"]);
  let resolved = 0;
  for (const p of picks ?? []) {
    const m = matchRider(p.raw_name, peloton, year);
    if (m.kind === "matched") {
      await supabase
        .from("team_riders")
        .update({ rider_id: m.rider.id, match_status: "matched", match_candidates: null })
        .eq("id", p.id);
      resolved++;
    }
  }
  return resolved;
}
