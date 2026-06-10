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

config({ path: join(__dirname, "..", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
}

type RiderRow = { id: string; full_name: string; last_name: string; pro_team: string | null };

function matchRider(rawName: string, riders: RiderRow[]):
  | { kind: "matched"; rider: RiderRow }
  | { kind: "ambiguous"; candidates: RiderRow[] }
  | { kind: "unmatched" } {

  const tokens = rawName.replace(/[,]/g, " ").split(/\s+/).map(t => t.trim()).filter(Boolean);
  if (tokens.length === 0) return { kind: "unmatched" };

  const pickedLast = normalize(tokens[tokens.length - 1]);
  const pickedInitial = tokens.length > 1 ? normalize(tokens.slice(0, -1).join(" ")) : null;

  // Last-name match
  let candidates = riders.filter(r => {
    const lastNorm = normalize(r.last_name);
    if (lastNorm === pickedLast) return true;
    // substring fallback for compound names
    if (lastNorm.includes(pickedLast) || pickedLast.includes(lastNorm)) return true;
    // check all tokens of full name
    const fullTokens = r.full_name.split(/\s+/).map(normalize);
    return fullTokens.some(t => t === pickedLast);
  });

  if (candidates.length === 0) return { kind: "unmatched" };
  if (candidates.length === 1) return { kind: "matched", rider: candidates[0] };

  // Narrow by initial/first name
  if (pickedInitial) {
    const narrowed = candidates.filter(r => {
      const full = r.full_name.trim();
      const last = r.last_name.trim();
      const firstName = full.toLowerCase().endsWith(last.toLowerCase())
        ? full.slice(0, full.length - last.length).trim()
        : full;
      const fn = normalize(firstName);
      return pickedInitial.length === 1
        ? fn.startsWith(pickedInitial)
        : fn === pickedInitial || fn.startsWith(pickedInitial);
    });
    if (narrowed.length === 1) return { kind: "matched", rider: narrowed[0] };
    if (narrowed.length > 0) return { kind: "ambiguous", candidates: narrowed };
  }

  return { kind: "ambiguous", candidates };
}

async function resolvePool(poolId: string, year: number) {
  // Get riders for this pool
  const { data: riders } = await supabase
    .from("riders")
    .select("id, full_name, last_name, pro_team")
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
    const result = matchRider(pick.raw_name, riders as RiderRow[]);

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
        pro_team: c.pro_team,
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
