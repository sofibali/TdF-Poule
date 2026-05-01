// Shared "fetch latest results from PCS and write them to the DB" helper.
// Used by both the cron route (app/api/cron/fetch-results/route.ts) and the
// manual admin trigger (app/api/refresh/route.ts).

import { createServiceClient } from "@/lib/supabase/server";
import {
  detectCurrentStage,
  fetchFinalGc,
  fetchStageResults,
  fetchStartList,
} from "@/lib/scraper/pcs";

export type RefreshSummary = {
  pool_id: string;
  year: number;
  stages_fetched: number[];
  gc_fetched: boolean;
  riders_seeded: number;
  errors: string[];
};

/**
 * Populate the canonical riders table for a pool, if it's empty.
 * Pulls the start list from PCS and inserts one row per rider with
 * pcs_slug + pro_team. bib_number isn't on the start list page yet.
 */
async function seedRidersIfEmpty(
  supabase: ReturnType<typeof createServiceClient>,
  poolId: string,
  year: number,
): Promise<number> {
  const { count } = await supabase
    .from("riders")
    .select("*", { count: "exact", head: true })
    .eq("pool_id", poolId);
  if ((count ?? 0) > 0) return 0;

  try {
    const startList = await fetchStartList(year);
    if (startList.length === 0) return 0;
    const rows = startList.map((s) => {
      const parts = s.rider.trim().split(/\s+/);
      const last_name = parts.length > 1 ? parts.slice(-1)[0] : s.rider;
      return {
        pool_id: poolId,
        full_name: s.rider,
        last_name,
        pcs_slug: s.pcs_slug,
        pro_team: s.pro_team,
        bib_number: null,
      };
    });
    const { error } = await supabase
      .from("riders")
      .upsert(rows, { onConflict: "pool_id,full_name" });
    if (error) throw error;
    return rows.length;
  } catch {
    // Silently skip — rider names just won't have meta until we populate.
    return 0;
  }
}

/**
 * Best-effort: link stage_results.rider_id to the canonical riders table,
 * matching by last name. Updates rows whose rider_id is currently null.
 */
async function resolveStageRiders(
  supabase: ReturnType<typeof createServiceClient>,
  poolId: string,
): Promise<void> {
  const { data: riders } = await supabase
    .from("riders")
    .select("id, full_name, last_name")
    .eq("pool_id", poolId);
  if (!riders || riders.length === 0) return;

  // Build a last-name index, dropping ambiguous last names.
  const byLast = new Map<string, string | null>();
  for (const r of riders) {
    const k = r.last_name.toLowerCase();
    byLast.set(k, byLast.has(k) ? null : r.id);
  }

  const { data: unresolved } = await supabase
    .from("stage_results")
    .select("pool_id, stage, position, raw_name")
    .eq("pool_id", poolId)
    .is("rider_id", null);
  for (const row of unresolved ?? []) {
    const last = row.raw_name.toLowerCase().split(/\s+/).pop() ?? "";
    const id = byLast.get(last);
    if (id) {
      await supabase
        .from("stage_results")
        .update({ rider_id: id })
        .eq("pool_id", row.pool_id)
        .eq("stage", row.stage)
        .eq("position", row.position);
    }
  }
}

export async function refreshPool(year: number): Promise<RefreshSummary> {
  const supabase = createServiceClient();

  const { data: pool, error } = await supabase
    .from("pools")
    .select("id, year, num_stages, start_date")
    .eq("year", year)
    .single();
  if (error || !pool) {
    throw new Error(`No pool for year ${year}: ${error?.message ?? "not found"}`);
  }

  const summary: RefreshSummary = {
    pool_id: pool.id,
    year: pool.year,
    stages_fetched: [],
    gc_fetched: false,
    riders_seeded: 0,
    errors: [],
  };

  // Seed the riders table on first run — gives us pcs_slug + pro_team for the UI.
  summary.riders_seeded = await seedRidersIfEmpty(supabase, pool.id, pool.year);

  const startDate = pool.start_date ? new Date(pool.start_date) : new Date();
  const currentStage = await detectCurrentStage(pool.year, startDate);
  if (currentStage === 0) {
    summary.errors.push("Tour hasn't started yet");
    return summary;
  }

  const { data: existing } = await supabase
    .from("stage_results")
    .select("stage")
    .eq("pool_id", pool.id);
  const haveStages = new Set((existing ?? []).map((r) => r.stage));

  for (let stage = 1; stage <= currentStage; stage++) {
    if (haveStages.has(stage)) continue;
    try {
      const rows = await fetchStageResults(pool.year, stage);
      if (rows.length === 0) {
        summary.errors.push(`stage ${stage}: empty result set`);
        continue;
      }
      const upserts = rows.map((r) => ({
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
    await new Promise((r) => setTimeout(r, 750));
  }

  if (currentStage >= (pool.num_stages ?? 21)) {
    try {
      const gc = await fetchFinalGc(pool.year);
      if (gc.length > 0) {
        const upserts = gc.map((r) => ({
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

  // Link stage_results.rider_id to canonical riders so v_rider_totals can
  // join through to pcs_slug/pro_team/bib_number for the UI.
  try {
    await resolveStageRiders(supabase, pool.id);
  } catch (e) {
    summary.errors.push(
      `resolve stage riders: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  await supabase.from("import_log").insert({
    pool_id: pool.id,
    kind: "stage_fetch",
    message: `Refreshed: stages=${summary.stages_fetched.join(",") || "none"}, gc=${summary.gc_fetched}, riders_seeded=${summary.riders_seeded}`,
    details: summary,
  });

  return summary;
}
