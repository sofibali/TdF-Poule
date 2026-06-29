import type { createClient } from "@/lib/supabase/server";

/**
 * Years that have at least one team — i.e. pools you can actually view a
 * leaderboard/riders/matrix for. Race-result-only years (no pool played, or not
 * yet back-filled, e.g. 2006–2011) are excluded so they don't show up in the
 * year dropdowns. Returned newest-first.
 */
export async function yearsWithTeams(
  supabase: ReturnType<typeof createClient>,
): Promise<number[]> {
  const { data: teams } = await supabase.from("teams").select("pool_id");
  const withTeams = new Set((teams ?? []).map((t) => t.pool_id));
  const { data: pools } = await supabase
    .from("pools")
    .select("id, year")
    .order("year", { ascending: false });
  return (pools ?? []).filter((p) => withTeams.has(p.id)).map((p) => p.year as number);
}

/**
 * Years that have race results (a populated stage_results) — used by the Riders
 * page, which is meaningful for any year with results even without pool teams
 * (2000-2019 are a race-result archive). Newest-first.
 */
export async function yearsWithResults(
  supabase: ReturnType<typeof createClient>,
): Promise<number[]> {
  const { data: pools } = await supabase
    .from("pools")
    .select("id, year")
    .order("year", { ascending: false });
  // Per-pool count (head-only) — stage_results has thousands of rows, so a
  // plain select would hit PostgREST's 1000-row cap and miss pools.
  const flags = await Promise.all(
    (pools ?? []).map(async (p) => {
      const { count } = await supabase
        .from("stage_results")
        .select("*", { count: "exact", head: true })
        .eq("pool_id", p.id);
      return { year: p.year as number, has: (count ?? 0) > 0 };
    }),
  );
  return flags.filter((f) => f.has).map((f) => f.year);
}
