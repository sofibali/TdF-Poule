// Shared "fetch latest results from PCS and write them to the DB" helper.
// Used by both the cron route (app/api/cron/fetch-results/route.ts) and the
// manual admin trigger (app/api/refresh/route.ts).

import { createServiceClient } from "@/lib/supabase/server";
import {
  detectCurrentStage,
  fetchFinalGc,
  fetchStageResults,
  fetchStartList,
  lastNameOf,
  type StageResult,
} from "@/lib/scraper/pcs";
import { matchRider, type RiderRow } from "@/lib/scoring/canonical-match";

export type RefreshSummary = {
  pool_id: string;
  year: number;
  stages_fetched: number[];
  gc_fetched: boolean;
  riders_seeded: number;
  picks_resolved: number;
  picks_ambiguous: number;
  picks_unmatched: number;
  errors: string[];
};

// ---------------------------------------------------------------------------
// Name matching helpers
// ---------------------------------------------------------------------------

// normalize / matchRider / RiderRow now live in lib/scoring/canonical-match.ts
// (single source of truth, shared with the import path). nameKey moved to
// Postgres as public.rider_match_key — see migration 0008.

// ---------------------------------------------------------------------------
// Riders table seeding
// ---------------------------------------------------------------------------

/**
 * Populate or top-up the canonical riders table for a pool. Tries two sources
 * in order:
 *
 *   1) PCS start list page (rich — gives us pcs_slug + pro_team for everyone)
 *   2) Whatever we already have in stage_results / final_gc (each row carries
 *      pcs_slug + pro_team if the stage scraper found them)
 *
 * Always upserts with ON CONFLICT (pool_id, full_name) so re-runs are idempotent.
 * Returns the number of inserted/updated rider rows.
 */
async function seedRiders(
  supabase: ReturnType<typeof createServiceClient>,
  poolId: string,
  year: number,
): Promise<number> {
  type RiderSeed = {
    full_name: string;
    last_name: string;
    pcs_slug: string | null;
    pro_team: string | null;
    bib_number: number | null;
  };

  // Collect all candidates without dedup — the upsert_rider RPC handles dedup
  // atomically in SQL using a sorted-token match key, which is robust to PCS's
  // per-page name reordering ("Tadej Pogačar" vs "Pogačar Tadej").
  const candidates: RiderSeed[] = [];

  // --- Source 1: PCS start list ---
  try {
    const startList = await fetchStartList(year);
    for (const entry of startList) {
      const full = entry.rider.trim();
      if (!full) continue;
      candidates.push({
        full_name: full,
        last_name: lastNameOf(full),
        pcs_slug: entry.pcs_slug,
        pro_team: entry.pro_team,
        bib_number: entry.bib_number,
      });
    }
  } catch {
    /* fall through to source 2 */
  }

  // --- Source 2: stage_results + final_gc rows we've already saved ---
  const [{ data: stageRows }, { data: gcRows }] = await Promise.all([
    supabase
      .from("stage_results")
      .select("raw_name")
      .eq("pool_id", poolId),
    supabase.from("final_gc").select("raw_name").eq("pool_id", poolId),
  ]);
  const candidateNames = new Set<string>();
  for (const r of stageRows ?? []) {
    if (r.raw_name) candidateNames.add(r.raw_name.trim());
  }
  for (const r of gcRows ?? []) {
    if (r.raw_name) candidateNames.add(r.raw_name.trim());
  }
  for (const full of candidateNames) {
    if (!full) continue;
    candidates.push({
      full_name: full,
      last_name: lastNameOf(full),
      pcs_slug: null,
      pro_team: null,
      bib_number: null,
    });
  }

  if (candidates.length === 0) return 0;

  // Single bulk RPC instead of one call per rider — 1 round trip instead of
  // 200+. The SQL function dedups by sorted-token key, so PCS's name-order
  // variations all collapse to a single rider row.
  const { error: rpcErr } = await supabase.rpc("upsert_riders_bulk", {
    p_pool_id: poolId,
    p_riders: candidates,
  });
  if (rpcErr) {
    // Fall back to per-rider calls if the bulk RPC isn't deployed yet.
    for (const c of candidates) {
      await supabase.rpc("upsert_rider", {
        p_pool_id: poolId,
        p_full_name: c.full_name,
        p_last_name: c.last_name,
        p_pcs_slug: c.pcs_slug,
        p_pro_team: c.pro_team,
        p_bib_number: c.bib_number,
      });
    }
  }

  // Return the actual count after upserts so the UI shows the deduped total.
  const { count } = await supabase
    .from("riders")
    .select("*", { count: "exact", head: true })
    .eq("pool_id", poolId);
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Stage results: backfill rider_id from raw_name
// ---------------------------------------------------------------------------

async function resolveStageRiders(
  supabase: ReturnType<typeof createServiceClient>,
  poolId: string,
): Promise<void> {
  const { data: riders } = await supabase
    .from("riders")
    .select("id, full_name, last_name")
    .eq("pool_id", poolId);
  if (!riders || riders.length === 0) return;

  const { data: unresolved } = await supabase
    .from("stage_results")
    .select("pool_id, stage, position, raw_name")
    .eq("pool_id", poolId)
    .is("rider_id", null);

  for (const row of unresolved ?? []) {
    const result = matchRider(row.raw_name, riders as RiderRow[]);
    if (result.kind === "matched") {
      await supabase
        .from("stage_results")
        .update({ rider_id: result.rider.id })
        .eq("pool_id", row.pool_id)
        .eq("stage", row.stage)
        .eq("position", row.position);
    }
  }

  // Same treatment for final_gc.
  const { data: gcUnresolved } = await supabase
    .from("final_gc")
    .select("pool_id, position, raw_name")
    .eq("pool_id", poolId)
    .is("rider_id", null);
  for (const row of gcUnresolved ?? []) {
    const result = matchRider(row.raw_name, riders as RiderRow[]);
    if (result.kind === "matched") {
      await supabase
        .from("final_gc")
        .update({ rider_id: result.rider.id })
        .eq("pool_id", row.pool_id)
        .eq("position", row.position);
    }
  }
}

// ---------------------------------------------------------------------------
// Team picks: backfill rider_id from raw_name
// ---------------------------------------------------------------------------

async function resolveTeamRiders(
  supabase: ReturnType<typeof createServiceClient>,
  poolId: string,
  year: number | null,
): Promise<{ resolved: number; ambiguous: number; unmatched: number }> {
  const { data: riders } = await supabase
    .from("riders")
    .select("id, full_name, last_name")
    .eq("pool_id", poolId);
  if (!riders || riders.length === 0) {
    return { resolved: 0, ambiguous: 0, unmatched: 0 };
  }

  const { data: teams } = await supabase
    .from("teams")
    .select("id")
    .eq("pool_id", poolId);
  const teamIds = (teams ?? []).map((t) => t.id);
  if (teamIds.length === 0) {
    return { resolved: 0, ambiguous: 0, unmatched: 0 };
  }

  // Only retry picks that are still UNRESOLVED. Never re-touch ones already
  // 'matched' or 'manual' — re-resolving them on every refresh is what made
  // good resolutions flip back to 'ambiguous'. Team-pick resolution is now a
  // forward-only ratchet, decoupled from the rider/result scraping.
  const { data: picks } = await supabase
    .from("team_riders")
    .select("id, raw_name")
    .in("team_id", teamIds)
    .in("match_status", ["unmatched", "ambiguous"]);

  let resolved = 0;
  let ambiguous = 0;
  let unmatched = 0;

  for (const r of picks ?? []) {
    const result = matchRider(r.raw_name, riders as RiderRow[], year);
    if (result.kind === "matched") {
      await supabase
        .from("team_riders")
        .update({
          rider_id: result.rider.id,
          match_status: "matched",
          match_candidates: null,
        })
        .eq("id", r.id);
      resolved++;
    } else if (result.kind === "ambiguous") {
      const candidates = result.candidates.map((c) => ({
        rider_id: c.id,
        full_name: c.full_name,
      }));
      await supabase
        .from("team_riders")
        .update({
          rider_id: null,
          match_status: "ambiguous",
          match_candidates: candidates,
        })
        .eq("id", r.id);
      ambiguous++;
    } else {
      await supabase
        .from("team_riders")
        .update({
          rider_id: null,
          match_status: "unmatched",
          match_candidates: null,
        })
        .eq("id", r.id);
      unmatched++;
    }
  }

  return { resolved, ambiguous, unmatched };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function refreshPool(year: number): Promise<RefreshSummary> {
  const supabase = createServiceClient();

  const { data: pool, error } = await supabase
    .from("pools")
    .select("id, year, num_stages, start_date")
    .eq("year", year)
    .single();
  if (error || !pool) {
    throw new Error(
      `No pool for year ${year}: ${error?.message ?? "not found"}`,
    );
  }

  const summary: RefreshSummary = {
    pool_id: pool.id,
    year: pool.year,
    stages_fetched: [],
    gc_fetched: false,
    riders_seeded: 0,
    picks_resolved: 0,
    picks_ambiguous: 0,
    picks_unmatched: 0,
    errors: [],
  };

  const startDate = pool.start_date ? new Date(pool.start_date) : null;
  const currentStage = await detectCurrentStage(pool.year, startDate);
  if (currentStage === 0) {
    summary.errors.push(
      pool.start_date
        ? "Tour hasn't started yet"
        : "No start_date set for this pool (current year only — past years auto-fetch)",
    );
    return summary;
  }

  // Fetch any stages we don't have yet AND collect rich rider metadata
  // (pcs_slug, pro_team) from each row — way more reliable than the
  // separate /startlist page scrape.
  const { data: existing } = await supabase
    .from("stage_results")
    .select("stage")
    .eq("pool_id", pool.id);
  // Track how many rows we have per stage, not just presence. A stage that was
  // only partially saved (e.g. a fetch that died after 2 rows) must be
  // re-fetched, otherwise it's skipped forever and everyone loses those points.
  const stageRowCount = new Map<number, number>();
  for (const r of existing ?? [])
    stageRowCount.set(r.stage, (stageRowCount.get(r.stage) ?? 0) + 1);
  // A full Tour stage stores ~50 placings; treat anything thinner as incomplete.
  const MIN_COMPLETE_ROWS = 45;
  const haveStages = {
    has: (stage: number) => (stageRowCount.get(stage) ?? 0) >= MIN_COMPLETE_ROWS,
  };

  type RiderHarvest = {
    full_name: string;
    last_name: string;
    pcs_slug: string | null;
    pro_team: string | null;
    bib_number: number | null;
  };
  const harvestedRiders = new Map<string, RiderHarvest>();
  function harvest(r: StageResult) {
    const full = r.rider.trim();
    if (!full) return;
    // Dedup in-memory by lower-case full_name; the SQL RPC will do the
    // proper sorted-token dedup on the server side too.
    const key = full.toLowerCase();
    const existing = harvestedRiders.get(key);
    const seed: RiderHarvest = {
      full_name: full,
      last_name: lastNameOf(full),
      pcs_slug: r.pcs_slug,
      pro_team: r.pro_team,
      bib_number: null,
    };
    if (!existing) {
      harvestedRiders.set(key, seed);
      return;
    }
    // Merge — keep whichever has more info.
    if (!existing.pcs_slug && seed.pcs_slug) existing.pcs_slug = seed.pcs_slug;
    if (!existing.pro_team && seed.pro_team) existing.pro_team = seed.pro_team;
  }

  for (let stage = 1; stage <= currentStage; stage++) {
    if (haveStages.has(stage)) {
      // Even for stages already in our DB, we may not have rich rider data
      // for them yet — but skip the network fetch to save time.
      continue;
    }
    try {
      const rows = await fetchStageResults(pool.year, stage);
      if (rows.length === 0) {
        summary.errors.push(`stage ${stage}: empty result set`);
        continue;
      }
      // Harvest rider meta from each row while we're here.
      for (const r of rows) harvest(r);

      const upserts = rows.map((r: StageResult) => ({
        pool_id: pool.id,
        stage,
        position: r.position,
        rider_id: null,
        raw_name: r.rider,
      }));
      const { error: ins } = await supabase
        .from("stage_results")
        .upsert(upserts, { onConflict: "pool_id,stage,position" });
      if (ins) {
        summary.errors.push(`stage ${stage} write: ${ins.message}`);
      } else {
        summary.stages_fetched.push(stage);
      }
    } catch (e) {
      summary.errors.push(
        `stage ${stage}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    // Polite throttle — but tight enough that a 21-stage backfill finishes
    // well within Vercel's 60s function limit.
    await new Promise((r) => setTimeout(r, 200));
  }

  // Final GC — also harvest rider meta from here.
  if (currentStage >= (pool.num_stages ?? 21)) {
    try {
      const gc = await fetchFinalGc(pool.year);
      if (gc.length > 0) {
        for (const r of gc) harvest(r);
        const upserts = gc.map((r: StageResult) => ({
          pool_id: pool.id,
          position: r.position,
          rider_id: null,
          raw_name: r.rider,
        }));
        await supabase
          .from("final_gc")
          .upsert(upserts, { onConflict: "pool_id,position" });
        summary.gc_fetched = true;
      }
    } catch (e) {
      summary.errors.push(
        `gc: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // Seed the canonical riders table.
  //
  // First, upsert all the riders we just harvested from stage/GC pages — this
  // path carries pcs_slug + pro_team, which we won't get from the fallback
  // sources. Then seedRiders fills in any remaining riders (e.g. ones that
  // appear only in older stage_results we already had cached).
  if (harvestedRiders.size > 0) {
    const richSeeds = Array.from(harvestedRiders.values());
    const { error: rpcErr } = await supabase.rpc("upsert_riders_bulk", {
      p_pool_id: pool.id,
      p_riders: richSeeds,
    });
    if (rpcErr) {
      // The most common cause is PostgREST's schema cache lagging behind
      // a recently-added function. Silently fall back to per-rider calls
      // (still correct, just slower) — don't surface a scary warning.
      const isSchemaCacheMiss = /schema cache|Could not find the function/i.test(
        rpcErr.message,
      );
      if (!isSchemaCacheMiss) {
        summary.errors.push(`harvest upsert: ${rpcErr.message}`);
      }
      for (const c of richSeeds) {
        await supabase.rpc("upsert_rider", {
          p_pool_id: pool.id,
          p_full_name: c.full_name,
          p_last_name: c.last_name,
          p_pcs_slug: c.pcs_slug,
          p_pro_team: c.pro_team,
          p_bib_number: c.bib_number,
        });
      }
    }
  }

  try {
    summary.riders_seeded = await seedRiders(supabase, pool.id, pool.year);
  } catch (e) {
    summary.errors.push(
      `seed riders: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // Now wire rider_id columns on stage_results, final_gc, and team_riders.
  try {
    await resolveStageRiders(supabase, pool.id);
  } catch (e) {
    summary.errors.push(
      `resolve stage riders: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  try {
    const resolution = await resolveTeamRiders(supabase, pool.id, pool.year);
    summary.picks_resolved = resolution.resolved;
    summary.picks_ambiguous = resolution.ambiguous;
    summary.picks_unmatched = resolution.unmatched;
  } catch (e) {
    summary.errors.push(
      `resolve team riders: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  await supabase.from("import_log").insert({
    pool_id: pool.id,
    kind: "stage_fetch",
    message: `Refreshed: stages=${summary.stages_fetched.join(",") || "none"}, gc=${summary.gc_fetched}, riders=${summary.riders_seeded}, picks=${summary.picks_resolved}/${summary.picks_ambiguous}/${summary.picks_unmatched}`,
    details: summary,
  });

  return summary;
}
