#!/usr/bin/env tsx
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
config({ path: join(__dirname, "..", ".env.local") });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: pool } = await sb.from("pools").select("id").eq("year", 2026).single();
  const pid = pool!.id;

  // De Lie dropout check
  const { data: deLie } = await sb.from("riders").select("id,full_name").eq("pool_id", pid).ilike("full_name", "%lie%").single();
  if (deLie) {
    const { data: dropout } = await sb.from("rider_dropouts").select("dropout_after_stage, withdrawal_type").eq("pool_id", pid).eq("rider_id", deLie.id).single();
    console.log(`De Lie: dropout_after_stage=${dropout?.dropout_after_stage} type=${dropout?.withdrawal_type}`);
    // What would his stage 3 contribution be?
    const { data: s3 } = await sb.from("v_rider_stage_points").select("points, position").eq("pool_id", pid).eq("rider_id", deLie.id).eq("stage", 3);
    console.log(`  Stage 3 result: ${JSON.stringify(s3)}`);
  }

  // Youth bonus for Claude AI team's youth riders
  const { data: team } = await sb.from("teams").select("id").eq("pool_id", pid).ilike("player_name", "%Claude%").single();
  const { data: picks } = await sb.from("team_riders").select("rider_id, raw_name").eq("team_id", team!.id);
  const riderIds = (picks ?? []).map(p => p.rider_id).filter(Boolean);

  console.log("\nYouth bonuses for Claude AI riders (all stages):");
  const { data: bonuses } = await sb.from("stage_youth_bonus").select("stage, rider_id, bonus_points").eq("pool_id", pid).in("rider_id", riderIds).order("stage");
  const { data: riderNames } = await sb.from("riders").select("id, full_name").in("id", riderIds);
  const nameMap = new Map((riderNames ?? []).map(r => [r.id, r.full_name]));
  for (const b of bonuses ?? []) {
    console.log(`  Stage ${b.stage}: ${nameMap.get(b.rider_id)} → ${b.bonus_points} pts`);
  }
  const totalYouth = (bonuses ?? []).reduce((s, b) => s + b.bonus_points, 0);
  console.log(`  Total youth bonus: ${totalYouth}`);

  // Per-rider stage breakdown for Claude AI
  console.log("\nPer-rider stage points (Claude AI, all 6 stages):");
  const { data: rsp } = await sb.from("v_rider_stage_points").select("stage, rider_id, rider_name, points, position").eq("pool_id", pid).in("rider_id", riderIds).order("stage").order("points", { ascending: false });
  let runTotal = 0;
  for (const r of rsp ?? []) { runTotal += r.points; console.log(`  S${r.stage} pos${r.position} ${r.rider_name}: ${r.points}`); }
  console.log(`  Sum of all rider stage pts (includes youth): ${runTotal}`);
}
main().catch(console.error);
