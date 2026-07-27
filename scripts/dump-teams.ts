#!/usr/bin/env tsx
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
import { writeFileSync } from "node:fs";

config({ path: join(__dirname, "../../../../../Users/sbali/myGit/TdF-Poule/.env.local") });
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data: pool } = await sb.from("pools").select("id").eq("year", 2026).single();
  const pid = pool!.id;
  console.error("pool_id:", pid);

  // All teams
  const { data: teams } = await sb
    .from("teams")
    .select("id, player_name")
    .eq("pool_id", pid)
    .order("player_name");
  console.error("Teams:", teams?.length);

  // All team_riders (with rider full_name via join)
  const { data: picks } = await sb
    .from("team_riders")
    .select("team_id, raw_name, rider_id, is_reserve, riders(full_name, last_name)")
    .in("team_id", (teams ?? []).map((t) => t.id));

  // All rider_dropouts
  const { data: dropouts } = await sb
    .from("rider_dropouts")
    .select("rider_id, dropout_after_stage, reason")
    .eq("pool_id", pid);

  // All v_rider_stage_points (per rider per stage, already includes youth bonus)
  // This view may not have pool_id column - check
  // Use the underlying approach: stage points from the view
  let stagePoints: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from("v_rider_stage_points")
      .select("rider_id, stage, points")
      .eq("pool_id", pid)
      .range(from, from + 999);
    if (error) { console.error("v_rider_stage_points error:", error.message); break; }
    if (!data || data.length === 0) break;
    stagePoints.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  console.error("Stage point rows:", stagePoints.length);

  // All riders (full names for matching)
  const { data: riders } = await sb
    .from("riders")
    .select("id, full_name, last_name")
    .eq("pool_id", pid);

  // Team stage totals (Dagtotaal per team per stage)
  let teamStagePts: any[] = [];
  {
    let f = 0;
    while (true) {
      const { data, error } = await sb
        .from("v_team_stage_points")
        .select("team_id, stage, points")
        .in("team_id", (teams ?? []).map((t) => t.id))
        .range(f, f + 999);
      if (error) { console.error("v_team_stage_points error:", error.message); break; }
      if (!data || data.length === 0) break;
      teamStagePts.push(...data);
      if (data.length < 1000) break;
      f += 1000;
    }
  }
  console.error("Team stage point rows:", teamStagePts.length);

  const result = { teams, picks, dropouts, stagePoints, riders, teamStagePts };
  writeFileSync(
    join(__dirname, "teams-data.json"),
    JSON.stringify(result, null, 2),
  );
  console.error("Written teams-data.json");
}

main().catch(console.error);
