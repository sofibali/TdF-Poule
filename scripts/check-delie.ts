#!/usr/bin/env tsx
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
config({ path: join(__dirname, "..", ".env.local") });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: pool } = await sb.from("pools").select("id").eq("year", 2026).single();
  const pid = pool!.id;
  const DE_LIE_ID = "6362c5d1-99f1-4015-83af-3d6554126220";

  const { data: dropout } = await sb.from("rider_dropouts")
    .select("dropout_after_stage, withdrawal_type, rider_id")
    .eq("pool_id", pid).eq("rider_id", DE_LIE_ID).single();
  console.log("De Lie dropout:", dropout);

  // His stage results
  const { data: sr } = await sb.from("stage_results")
    .select("stage, position, raw_name")
    .eq("pool_id", pid).eq("rider_id", DE_LIE_ID).order("stage");
  console.log("De Lie stage results:", sr);

  // What team_active_riders returns for Claude AI around stage 3
  const { data: team } = await sb.from("teams").select("id").eq("pool_id", pid).ilike("player_name", "%Claude%").single();
  const { data: teamPts } = await sb.from("v_team_stage_points")
    .select("stage, points").eq("team_id", team!.id).order("stage");
  console.log("\nClaude AI stage points:", teamPts);

  // Check which riders are in v_rider_stage_points for stage 3 on this pool
  // to see if De Lie scored
  const { data: s3pts } = await sb.from("v_rider_stage_points")
    .select("rider_name, points, position, rider_id")
    .eq("pool_id", pid).eq("stage", 3).eq("rider_id", DE_LIE_ID);
  console.log("\nDe Lie stage 3 points:", s3pts);

  // Check Hindley activation — his stage points after stage 3
  const HINDLEY_ID = "ac7bd765-5758-48bb-9245-e49aeb64ed09";
  const { data: hindley } = await sb.from("v_rider_stage_points")
    .select("stage, points, position").eq("pool_id", pid).eq("rider_id", HINDLEY_ID).order("stage");
  console.log("\nHindley stage points (reserve R1):", hindley);
}
main().catch(console.error);
