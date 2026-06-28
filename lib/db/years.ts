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
