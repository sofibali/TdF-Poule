// Resolve unmatched 2026 team picks using canonical-match token-set matching.
// Also fixes any wrong matches (e.g. wrong Johannessen).
// Usage: npx tsx scripts/resolve-2026-picks.ts

import { createClient } from "@supabase/supabase-js";
import { matchRider, type RiderRow } from "@/lib/scoring/canonical-match";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const POOL_ID = "8289ed44-ff43-42c0-bb22-83443764a5d1";

async function main() {
  const { data: riders } = await sb
    .from("riders")
    .select("id, full_name, last_name, bib_number")
    .eq("pool_id", POOL_ID);
  const peloton = (riders ?? []) as RiderRow[];

  const { data: teams } = await sb.from("teams").select("id").eq("pool_id", POOL_ID);
  const teamIds = (teams ?? []).map((t: { id: string }) => t.id);

  const { data: picks } = await sb
    .from("team_riders")
    .select("id, raw_name, is_reserve, match_status")
    .in("team_id", teamIds);

  // Force-re-resolve everything (both unmatched AND already matched — lets
  // canonical-match correct the wrong Johannessen).
  let fixed = 0, failed: string[] = [];

  for (const pick of picks ?? []) {
    const result = matchRider(pick.raw_name as string, peloton, 2026);
    if (result.kind === "matched") {
      await sb
        .from("team_riders")
        .update({ rider_id: result.rider.id, match_status: "matched", match_candidates: null })
        .eq("id", pick.id);
      const bib = (result.rider as any).bib_number;
      console.log(`  ✓ "${pick.raw_name}" → ${result.rider.full_name} (#${bib ?? "?"})`);
      fixed++;
    } else {
      console.log(`  ✗ "${pick.raw_name}" — ${result.kind} (${(result as any).candidates?.map((c: any) => c.full_name).join(", ") ?? "no candidates"})`);
      failed.push(pick.raw_name as string);
    }
  }

  console.log(`\nMatched: ${fixed}  Failed: ${failed.length}`);
  if (failed.length) {
    console.log("Still unmatched:", failed);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
