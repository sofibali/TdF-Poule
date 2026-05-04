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
  picks_resolved: number;
  picks_ambiguous: number;
  picks_unmatched: number;
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

// Strip diacritics + non-letters and lowercase, so "Pogačar" matches "Pogacar".
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
}

type RiderRow = { id: string; full_name: string; last_name: string };

/**
 * Build a last-name → rider_id index. When multiple riders share a last name,
 * the value becomes null (signaling ambiguity — caller should fall back).
 */
function buildLastNameIndex(riders: RiderRow[]): Map<string, string | null> {
  const idx = new Map<string, string | null>();
  for (const r of riders) {
    const k = normalize(r.last_name);
    idx.set(k, idx.has(k) ? null : r.id);
  }
  return idx;
}

/**
 * Match a docx-style raw_name (e.g. "Pogacar", "T. Pogacar", "Ca. Rodriguez")
 * to a canonical rider. Last-name match by default; if ambiguous, narrow by
 * the first initial when the raw name has one.
 */
function matchByLastName(
  rawName: string,
  riders: RiderRow[],
  idx: Map<string, string | null>,
): { rider_id: string | null; ambiguous: boolean } {
  const parts = rawName.replace(/[,]/g, " ").split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { rider_id: null, ambiguous: false };
  const last = normalize(parts[parts.length - 1]);
  const initial = parts.length > 1 ? normalize(parts.slice(0, -1).join(" ")) : null;

  const idxHit = idx.get(last);
  if (idxHit) return { rider_id: idxHit, ambiguous: false };
  if (idxHit === null && idx.has(last)) {
    // Ambiguous: try to narrow with first-initial / first-name
    if (initial) {
      const candidates = riders.filter((r) => normalize(r.last_name) === last);
      const narrowed = candidates.filter((r) => {
        const first = normalize(
          r.full_name.replace(new RegExp(r.last_name + "$", "i"), ""),
        );
        return first === initial || (initial.length === 1 && first.startsWith(initial));
      });
      if (narrowed.length === 1) return { rider_id: narrowed[0].id, ambiguous: false };
    }
    return { rider_id: null, ambiguous: true };
  }
  return { rider_id: null, ambiguous: false };
}

/**
 * Best-effort: link stage_results.rider_id to the canonical riders table.
 * Updates rows whose rider_id is currently null.
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

  const idx = buildLastNameIndex(riders as RiderRow[]);

  const { data: unresolved } = await supabase
    .from("stage_results")
    .select("pool_id, stage, position, raw_name")
    .eq("pool_id", poolId)
    .is("rider_id", null);
  for (const row of unresolved ?? []) {
    const { rider_id } = matchByLastName(row.raw_name, riders as RiderRow[], idx);
    if (rider_id) {
      await supabase
        .from("stage_results")
        .update({ rider_id })
        .eq("pool_id", row.pool_id)
        .eq("stage", row.stage)
        .eq("position", row.position);
    }
  }
}

/**
 * Resolve team_riders.rider_id by matching raw_name against the canonical
 * riders table. Without this step, the scoring view never finds matches and
 * everyone scores zero. Returns counts so the UI can show progress.
 */
async function resolveTeamRiders(
  supabase: ReturnType<typeof createServiceClient>,
  poolId: string,
): Promise<{ resolved: number; ambiguous: number; unmatched: number }> {
  const { data: riders } = await supabase
    .from("riders")
    .select("id, full_name, last_name")
    .eq("pool_id", poolId);
  if (!riders || riders.length === 0) {
    return { resolved: 0, ambiguous: 0, unmatched: 0 };
  }

  const idx = buildLastNameIndex(riders as RiderRow[]);

  // Find every team_riders row in this pool whose rider_id isn't set yet.
  // We have to join through teams to filter by pool.
  const { data: picks } = await supabase
    .from("team_riders")
    .select("id, raw_name, teams!inner(pool_id)")
    .eq("teams.pool_id", poolId)
    .is("rider_id", null);

  let resolved = 0;
  let ambiguous = 0;
  let unmatched = 0;

  for (const row of picks ?? []) {
    const r = row as unknown as { id: string; raw_name: string };
    const { rider_id, ambiguous: amb } = matchByLastName(
      r.raw_name,
      riders as RiderRow[],
      idx,
    );
    if (rider_id) {
      await supabase
        .from("team_riders")
        .update({ rider_id, match_status: "matched" })
        .eq("id", r.id);
      resolved++;
    } else if (amb) {
      // Build the candidate shortlist so /admin/upload (or a future resolution
      // page) can let Sofia pick which rider was meant.
      const last = normalize(r.raw_name.split(/\s+/).pop() ?? "");
      const candidates = (riders as RiderRow[])
        .filter((rr) => normalize(rr.last_name) === last)
        .map((rr) => ({ rider_id: rr.id, full_name: rr.full_name }));
      await supabase
        .from("team_riders")
        .update({ match_status: "ambiguous", match_candidates: candidates })
        .eq("id", r.id);
      ambiguous++;
    } else {
      unmatched++;
    }
  }

  return { resolved, ambiguous, unmatched };
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
    picks_resolved: 0,
    picks_ambiguous: 0,
    picks_unmatched: 0,
    errors: [],
  };

  // Seed the riders table on first run — gives us pcs_slug + pro_team for the UI.
  summary.riders_seeded = await seedRidersIfEmpty(supabase, pool.id, pool.year);

  // Past Tours don't need start_date — detectCurrentStage returns 21 for any
  // year < this year. For the current year, we need start_date to figure out
  // what stage we're on; if it's missing we treat the Tour as not-yet-started.
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

  // Match team_riders.raw_name → riders so the scoring view can join. Without
  // this step, every pick has rider_id=null and no team scores any points.
  try {
    const resolution = await resolveTeamRiders(supabase, pool.id);
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
    message: `Refreshed: stages=${summary.stages_fetched.join(",") || "none"}, gc=${summary.gc_fetched}, riders_seeded=${summary.riders_seeded}`,
    details: summary,
  });

  return summary;
}
