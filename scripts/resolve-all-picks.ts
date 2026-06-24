#!/usr/bin/env tsx
/**
 * Resolves all unmatched team_riders picks against the riders table
 * for every pool that has both teams and riders.
 *
 * Run:  npx tsx scripts/resolve-all-picks.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
import { matchRider, type RiderRow } from "../lib/scoring/canonical-match";

config({ path: join(__dirname, "..", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function resolvePool(poolId: string, year: number) {
  // Get riders for this pool
  const { data: riders } = await supabase
    .from("riders")
    .select("id, full_name, last_name")
    .eq("pool_id", poolId);

  if (!riders || riders.length === 0) {
    console.log(`  ${year}: no riders in DB — skip (needs /admin/refresh first)`);
    return;
  }

  // Get teams
  const { data: teams } = await supabase
    .from("teams")
    .select("id")
    .eq("pool_id", poolId);
  const teamIds = (teams ?? []).map(t => t.id);
  if (teamIds.length === 0) {
    console.log(`  ${year}: no teams — skip`);
    return;
  }

  // Get all non-manual picks
  const { data: picks } = await supabase
    .from("team_riders")
    .select("id, raw_name, match_status")
    .in("team_id", teamIds)
    .neq("match_status", "manual");

  let resolved = 0, ambiguous = 0, unmatched = 0;

  for (const pick of picks ?? []) {
    const result = matchRider(pick.raw_name, riders as RiderRow[], year);

    if (result.kind === "matched") {
      await supabase
        .from("team_riders")
        .update({
          rider_id: result.rider.id,
          match_status: "matched",
          match_candidates: null,
        })
        .eq("id", pick.id);
      resolved++;
    } else if (result.kind === "ambiguous") {
      const cands = result.candidates.map(c => ({
        rider_id: c.id,
        full_name: c.full_name,
      }));
      await supabase
        .from("team_riders")
        .update({
          rider_id: null,
          match_status: "ambiguous",
          match_candidates: cands,
        })
        .eq("id", pick.id);
      ambiguous++;
    } else {
      await supabase
        .from("team_riders")
        .update({
          rider_id: null,
          match_status: "unmatched",
          match_candidates: null,
        })
        .eq("id", pick.id);
      unmatched++;
    }
  }

  console.log(`  ${year}: ${resolved} matched, ${ambiguous} ambiguous, ${unmatched} unmatched (${riders.length} riders in pool)`);
}

async function main() {
  // Get all pools that have both teams and riders
  const { data: pools } = await supabase
    .from("pools")
    .select("id, year")
    .order("year");

  console.log("Resolving picks for all pools with teams + riders...\n");

  for (const pool of pools ?? []) {
    // Check if this pool has teams
    const { count: teamCount } = await supabase
      .from("teams")
      .select("*", { count: "exact", head: true })
      .eq("pool_id", pool.id);

    if (!teamCount || teamCount === 0) continue;

    await resolvePool(pool.id, pool.year);
  }

  console.log("\n=== Done! ===");
  console.log("Ambiguous picks can be fixed at /admin/results on your site.");
  console.log("Unmatched picks are riders not in the start list (DNS, typos).");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
