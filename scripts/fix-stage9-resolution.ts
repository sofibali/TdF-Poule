#!/usr/bin/env tsx
/**
 * Resolves rider_ids for stage 9 (all positions currently have rider_id = null for pos 1-51).
 * matchRider works correctly; this script directly applies the resolution.
 *
 * Run: npx tsx scripts/fix-stage9-resolution.ts
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

  const { data: rows } = await sb
    .from("stage_results")
    .select("stage, position, raw_name")
    .eq("pool_id", pid)
    .eq("stage", 9)
    .is("rider_id", null)
    .order("position");

  console.log(`Unresolved stage 9 rows: ${rows?.length ?? 0}`);
  let resolved = 0, ambiguous = 0, unmatched = 0;
  for (const r of rows ?? []) {
    const m = matchRider(r.raw_name, peloton, 2026);
    if (m.kind === "matched") {
      const { error } = await sb
        .from("stage_results")
        .update({ rider_id: m.rider.id })
        .eq("pool_id", pid)
        .eq("stage", r.stage)
        .eq("position", r.position);
      if (error) console.error(`  update error pos ${r.position}: ${error.message}`);
      else resolved++;
    } else if (m.kind === "ambiguous") {
      ambiguous++;
      console.log(`  AMBIGUOUS pos ${r.position} ${r.raw_name}: ${m.candidates.map(c => c.full_name).join(" | ")}`);
    } else {
      unmatched++;
      console.log(`  UNMATCHED pos ${r.position} ${r.raw_name}`);
    }
  }
  console.log(`\nResolved: ${resolved}, Ambiguous: ${ambiguous}, Unmatched: ${unmatched}`);

  // Verify
  const { count: stillNull } = await sb
    .from("stage_results")
    .select("*", { count: "exact", head: true })
    .eq("pool_id", pid).eq("stage", 9).is("rider_id", null);
  console.log(`Stage 9 still unresolved: ${stillNull}`);
}
main().catch(console.error);
