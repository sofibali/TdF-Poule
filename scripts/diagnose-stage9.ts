#!/usr/bin/env tsx
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
config({ path: join(__dirname, "..", ".env.local") });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: pool } = await sb.from("pools").select("id").eq("year", 2026).single();
  const pid = pool!.id;

  // Raw stage 9 results — positions
  const { data: sr } = await sb
    .from("stage_results")
    .select("position, raw_name, rider_id")
    .eq("pool_id", pid).eq("stage", 9)
    .order("position")
    .limit(30);
  console.log("=== stage_results for stage 9 (first 30) ===");
  for (const r of sr ?? []) console.log(`  pos ${r.position}: ${r.raw_name}`);

  // How many distinct positions?
  const positions = new Set((sr ?? []).map(r => r.position));
  console.log(`\nDistinct positions in stage 9: ${[...positions].sort((a,b)=>a-b).join(", ")}`);

  // Stage point table — what does pos 5 give?
  const { data: spt } = await sb.from("stage_point_table").select("position, points").order("position").limit(25);
  console.log("\n=== stage_point_table ===");
  for (const r of spt ?? []) console.log(`  pos ${r.position} → ${r.points} pts`);

  // v_rider_stage_points for stage 9
  const { data: rsp } = await sb
    .from("v_rider_stage_points")
    .select("rider_name, points, position")
    .eq("pool_id", pid).eq("stage", 9)
    .order("points", { ascending: false })
    .limit(20);
  console.log("\n=== v_rider_stage_points stage 9 (top 20) ===");
  for (const r of rsp ?? []) console.log(`  ${r.rider_name}: ${r.points} pts (pos ${r.position})`);

  // Is stage 9 a TTT? Check if same team appears multiple times in top 10
  console.log("\n=== TTT check — top 10 positions ===");
  const { data: sr10 } = await sb
    .from("stage_results")
    .select("position, raw_name, pro_team")
    .eq("pool_id", pid).eq("stage", 9)
    .order("position").limit(10);
  for (const r of sr10 ?? []) console.log(`  pos ${r.position}: ${r.raw_name} (${r.pro_team ?? "?"})`);
}
main().catch(console.error);
