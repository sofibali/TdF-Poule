#!/usr/bin/env tsx
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
config({ path: join(__dirname, "..", ".env.local") });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: pool } = await sb.from("pools").select("id").eq("year", 2026).single();
  const pid = pool!.id;

  // Team points for stage 9
  const { data: pts } = await sb
    .from("v_team_stage_points")
    .select("team_id, points")
    .eq("pool_id", pid).eq("stage", 9)
    .order("points", { ascending: false });
  const { data: teams } = await sb.from("teams").select("id, name, player_name").eq("pool_id", pid);
  const tmap = new Map((teams ?? []).map(t => [t.id, `${t.player_name}`]));
  console.log("=== Team stage 9 points ===");
  for (const p of pts ?? []) console.log(`  ${tmap.get(p.team_id)?.padEnd(15)}: ${p.points}`);

  // Compare stage 8 to see if stage 9 is anomalous
  const { data: pts8 } = await sb
    .from("v_team_stage_points")
    .select("team_id, points")
    .eq("pool_id", pid).eq("stage", 8)
    .order("points", { ascending: false });
  console.log("\n=== Team stage 8 points (for comparison) ===");
  for (const p of pts8 ?? []) console.log(`  ${tmap.get(p.team_id)?.padEnd(15)}: ${p.points}`);

  // Check stages 7-9 all at once
  const { data: recent } = await sb
    .from("v_team_stage_points")
    .select("team_id, stage, points")
    .eq("pool_id", pid)
    .in("stage", [7, 8, 9])
    .order("stage").order("points", { ascending: false });
  console.log("\n=== Stages 7/8/9 — points distribution ===");
  for (const s of [7,8,9]) {
    const rows = (recent ?? []).filter(r => r.stage === s);
    const vals = rows.map(r => r.points).filter(v => v > 0);
    console.log(`  Stage ${s}: [${vals.join(", ")}]  (${vals.length} teams scored)`);
  }

  // Check how many total stage_results rows exist for stage 9
  const { count } = await sb.from("stage_results").select("*", { count: "exact", head: true }).eq("pool_id", pid).eq("stage", 9);
  console.log(`\nTotal stage_results rows for stage 9: ${count}`);

  // Youth bonus for stage 9?
  const { data: yb9 } = await sb.from("stage_youth_bonus").select("bonus_points, rider_id").eq("pool_id", pid).eq("stage", 9);
  console.log(`Youth bonus rows for stage 9: ${yb9?.length ?? 0}`);
}
main().catch(console.error);
