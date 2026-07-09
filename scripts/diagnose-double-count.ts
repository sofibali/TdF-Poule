#!/usr/bin/env tsx
/**
 * Checks for riders who appear in both main + reserve slots on the same team,
 * or appear multiple times in team_active_riders output for any stage.
 * Run: npx tsx scripts/diagnose-double-count.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";

config({ path: join(__dirname, "..", ".env.local") });
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data: pool } = await sb.from("pools").select("id").eq("year", 2026).single();
  if (!pool) { console.error("No 2026 pool"); process.exit(1); }

  // 1. Riders matched to the same rider_id in both main and reserve slots on one team
  console.log("\n=== Riders in BOTH main and reserve on same team ===");
  const { data: picks } = await sb
    .from("team_riders")
    .select("team_id, rider_id, raw_name, is_reserve, match_status")
    .eq("pool_id", pool.id)
    .not("rider_id", "is", null)
    .not("match_status", "in", '("unmatched","ambiguous")');

  const byTeamRider = new Map<string, { main: boolean; reserve: boolean; raw_name: string }>();
  for (const p of picks ?? []) {
    const key = `${p.team_id}::${p.rider_id}`;
    const existing = byTeamRider.get(key) ?? { main: false, reserve: false, raw_name: p.raw_name };
    if (p.is_reserve) existing.reserve = true;
    else existing.main = true;
    byTeamRider.set(key, existing);
  }
  let doubleFound = false;
  for (const [key, v] of byTeamRider) {
    if (v.main && v.reserve) {
      console.log(`  DOUBLE: ${key} — "${v.raw_name}" in both main and reserve`);
      doubleFound = true;
    }
  }
  if (!doubleFound) console.log("  None — good.");

  // 2. Check v_team_stage_points for unusually high single-stage scores
  console.log("\n=== Teams with stage points > 80 (potential double-count) ===");
  const { data: stagePoints } = await sb
    .from("v_team_stage_points")
    .select("team_id, stage, points")
    .eq("pool_id", pool.id)
    .gt("points", 80);
  if ((stagePoints ?? []).length === 0) {
    console.log("  None — good.");
  } else {
    const { data: teams } = await sb
      .from("teams")
      .select("id, name, player_name")
      .eq("pool_id", pool.id);
    const teamMap = new Map((teams ?? []).map((t) => [t.id, `${t.name} (${t.player_name})`]));
    for (const s of stagePoints ?? []) {
      console.log(`  Stage ${s.stage}: ${teamMap.get(s.team_id) ?? s.team_id} — ${s.points} pts`);
    }
  }

  // 3. Leaderboard totals — show all teams
  console.log("\n=== Leaderboard (all 2026 teams) ===");
  const { data: lb } = await sb
    .from("v_leaderboard")
    .select("rank, name, player_name, stage_points, gc_points, total_points")
    .eq("year", 2026)
    .order("rank");
  for (const r of lb ?? []) {
    console.log(`  #${r.rank} ${r.name} (${r.player_name}): stage=${r.stage_points} gc=${r.gc_points} total=${r.total_points}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
