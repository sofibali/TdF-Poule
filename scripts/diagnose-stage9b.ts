#!/usr/bin/env tsx
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
config({ path: join(__dirname, "..", ".env.local") });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: pool } = await sb.from("pools").select("id").eq("year", 2026).single();
  const pid = pool!.id;

  // How many stage 9 results have rider_id resolved vs null?
  const { count: total } = await sb.from("stage_results").select("*", { count: "exact", head: true }).eq("pool_id", pid).eq("stage", 9);
  const { count: resolved } = await sb.from("stage_results").select("*", { count: "exact", head: true }).eq("pool_id", pid).eq("stage", 9).not("rider_id", "is", null);
  console.log(`Stage 9: ${resolved}/${total} rows have rider_id resolved`);

  // Which rider_id DO exist for stage 9 (who got matched)
  const { data: matched } = await sb.from("stage_results")
    .select("position, raw_name, rider_id")
    .eq("pool_id", pid).eq("stage", 9)
    .not("rider_id", "is", null)
    .order("position");
  console.log(`\nMatched rows (${matched?.length}):`);
  for (const r of matched ?? []) console.log(`  pos ${r.position}: ${r.raw_name} → ${r.rider_id}`);

  // Compare with stage 8 to see if resolution worked
  const { count: total8 } = await sb.from("stage_results").select("*", { count: "exact", head: true }).eq("pool_id", pid).eq("stage", 8);
  const { count: resolved8 } = await sb.from("stage_results").select("*", { count: "exact", head: true }).eq("pool_id", pid).eq("stage", 8).not("rider_id", "is", null);
  console.log(`\nStage 8 for comparison: ${resolved8}/${total8} rows have rider_id resolved`);

  // Check stages 7,8,9 resolution rates
  for (const s of [7, 8, 9]) {
    const { count: t } = await sb.from("stage_results").select("*", { count: "exact", head: true }).eq("pool_id", pid).eq("stage", s);
    const { count: r } = await sb.from("stage_results").select("*", { count: "exact", head: true }).eq("pool_id", pid).eq("stage", s).not("rider_id", "is", null);
    console.log(`Stage ${s}: ${r}/${t} resolved`);
  }
}
main().catch(console.error);
