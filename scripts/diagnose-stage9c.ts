#!/usr/bin/env tsx
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
config({ path: join(__dirname, "..", ".env.local") });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: pool } = await sb.from("pools").select("id").eq("year", 2026).single();
  const pid = pool!.id;

  // Youth bonus for stage 9
  const { data: yb } = await sb.from("stage_youth_bonus")
    .select("rider_id, bonus_points").eq("pool_id", pid).eq("stage", 9);
  const { data: rnames } = await sb.from("riders").select("id, full_name")
    .in("id", (yb ?? []).map(b => b.rider_id));
  const nm = new Map((rnames ?? []).map(r => [r.id, r.full_name]));
  console.log("Stage 9 youth bonus:");
  for (const b of yb ?? []) console.log(`  ${nm.get(b.rider_id)} → ${b.bonus_points} pts`);

  // Check if popular picks like Matthews / Van Der Poel have rider_id in stage 9
  const { data: vdp } = await sb.from("stage_results")
    .select("position, raw_name, rider_id").eq("pool_id", pid).eq("stage", 9)
    .ilike("raw_name", "%poel%");
  console.log("\nVan der Poel in stage 9 results:", vdp);

  const { data: matt } = await sb.from("stage_results")
    .select("position, raw_name, rider_id").eq("pool_id", pid).eq("stage", 9)
    .ilike("raw_name", "%matthews%");
  console.log("Matthews in stage 9 results:", matt);

  // What position does each team's active rider score at stage 9?
  // Check a single team (Karin) to trace how she gets 5 pts
  const { data: karin } = await sb.from("teams").select("id").eq("pool_id", pid).ilike("player_name", "Karin").single();
  console.log("\nKarin team_id:", karin?.id);

  // Get Karin's active riders for stage 9 and their stage 9 results
  const { data: karinPicks } = await sb.from("team_riders")
    .select("rider_id, raw_name, is_reserve").eq("team_id", karin!.id);
  const karinRiderIds = (karinPicks ?? []).filter(p => p.rider_id).map(p => p.rider_id as string);

  const { data: s9results } = await sb.from("stage_results")
    .select("position, raw_name, rider_id").eq("pool_id", pid).eq("stage", 9)
    .in("rider_id", karinRiderIds);
  console.log("Karin riders with stage 9 results (by rider_id):", s9results?.length ?? 0);
  for (const r of s9results ?? []) console.log(`  pos ${r.position}: ${r.raw_name}`);

  // Check youth bonus for Karin's riders
  const { data: karinYB } = await sb.from("stage_youth_bonus")
    .select("rider_id, bonus_points").eq("pool_id", pid).eq("stage", 9)
    .in("rider_id", karinRiderIds);
  console.log("Karin youth bonus for stage 9:", karinYB);

  // Check what raw_name matches exist (unresolved) for Karin's picks on stage 9
  const { data: s9raw } = await sb.from("stage_results")
    .select("position, raw_name").eq("pool_id", pid).eq("stage", 9)
    .is("rider_id", null).order("position").limit(30);
  console.log("\nTop 30 unresolved stage 9 raw names:");
  for (const r of s9raw ?? []) console.log(`  pos ${r.position}: ${r.raw_name}`);
}
main().catch(console.error);
