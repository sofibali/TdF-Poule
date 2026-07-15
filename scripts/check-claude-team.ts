#!/usr/bin/env tsx
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
config({ path: join(__dirname, "..", ".env.local") });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: pool } = await sb.from("pools").select("id").eq("year", 2026).single();
  const { data: team } = await sb.from("teams").select("id,name,player_name").eq("pool_id", pool!.id).ilike("player_name", "%Claude%").single();
  if (!team) { console.log("No Claude team"); return; }
  console.log("Team:", team.name, "— player:", team.player_name);

  const { data: picks } = await sb.from("team_riders")
    .select("rider_id, raw_name, is_reserve, match_status, pick_order, reserve_order")
    .eq("team_id", team.id)
    .order("is_reserve").order("pick_order");

  console.log("\nPicks (M=main R=reserve):");
  for (const p of picks ?? []) {
    const slot = p.is_reserve ? `R${p.reserve_order}` : `M${p.pick_order}`;
    console.log(`  [${slot}] ${p.raw_name.padEnd(30)} match=${p.match_status} rider_id=${p.rider_id ?? "NULL"}`);
  }

  const unmatched = (picks ?? []).filter(p => !p.rider_id || p.match_status === "unmatched" || p.match_status === "ambiguous");
  console.log(`\nUnmatched/null picks: ${unmatched.length}`);

  const { data: pts } = await sb.from("v_team_stage_points").select("stage, points").eq("team_id", team.id).gt("points", 0).order("stage");
  const total = (pts ?? []).reduce((s: number, r: { points: number }) => s + r.points, 0);
  console.log(`\nTotal from v_team_stage_points: ${total}`);
  for (const p of pts ?? []) console.log(`  Stage ${p.stage}: ${p.points} pts`);
}
main().catch(console.error);
