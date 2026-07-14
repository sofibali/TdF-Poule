#!/usr/bin/env tsx
/**
 * Resolves rider_ids for ALL unresolved stage_results rows across all stages.
 * Reports unmatched/ambiguous names so they can be added to name-corrections.json.
 *
 * Run: npx tsx scripts/fix-all-resolution.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
import { matchRider, type RiderRow } from "@/lib/scoring/canonical-match";
config({ path: join(__dirname, "..", ".env.local") });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: pool } = await sb.from("pools").select("id").eq("year", 2026).single();
  const pid = pool!.id;

  const { data: riders } = await sb.from("riders").select("id, full_name, last_name").eq("pool_id", pid);
  const peloton = (riders ?? []) as RiderRow[];
  console.log(`Peloton size: ${peloton.length}`);

  // Fetch all unresolved rows (paginate to avoid limit)
  let allRows: { stage: number; position: number; raw_name: string }[] = [];
  let from = 0;
  while (true) {
    const { data } = await sb
      .from("stage_results")
      .select("stage, position, raw_name")
      .eq("pool_id", pid)
      .is("rider_id", null)
      .order("stage")
      .order("position")
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`Total unresolved rows: ${allRows.length}`);

  let resolved = 0, ambiguous = 0, unmatched = 0;
  const ambiguousNames = new Map<string, string[]>();
  const unmatchedNames = new Set<string>();

  for (const r of allRows) {
    const m = matchRider(r.raw_name, peloton, 2026);
    if (m.kind === "matched") {
      const { error } = await sb
        .from("stage_results")
        .update({ rider_id: m.rider.id })
        .eq("pool_id", pid)
        .eq("stage", r.stage)
        .eq("position", r.position);
      if (error) console.error(`  update error stage ${r.stage} pos ${r.position}: ${error.message}`);
      else resolved++;
    } else if (m.kind === "ambiguous") {
      ambiguous++;
      ambiguousNames.set(r.raw_name, m.candidates.map(c => c.full_name));
    } else {
      unmatched++;
      unmatchedNames.add(r.raw_name);
    }
  }

  console.log(`\nResolved: ${resolved}, Ambiguous: ${ambiguous}, Unmatched: ${unmatched}`);

  if (ambiguousNames.size > 0) {
    console.log("\n--- Ambiguous names (add to name-corrections.json) ---");
    for (const [name, cands] of ambiguousNames) {
      console.log(`  "${name}" → candidates: ${cands.join(" | ")}`);
    }
  }
  if (unmatchedNames.size > 0) {
    console.log("\n--- Unmatched names ---");
    for (const name of unmatchedNames) console.log(`  "${name}"`);
  }

  // Verify
  const { count: stillNull } = await sb
    .from("stage_results")
    .select("*", { count: "exact", head: true })
    .eq("pool_id", pid)
    .is("rider_id", null);
  console.log(`\nStill unresolved after fix: ${stillNull}`);
}
main().catch(console.error);
