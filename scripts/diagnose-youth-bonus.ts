#!/usr/bin/env tsx
/**
 * Diagnoses youth bonus data in stage_youth_bonus for the 2026 pool.
 * Run: npx tsx scripts/diagnose-youth-bonus.ts
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

  // 1. All youth bonus awards by stage
  console.log("\n=== stage_youth_bonus (all stages) ===");
  const { data: bonuses } = await sb
    .from("stage_youth_bonus")
    .select("stage, bonus_points, rider_id")
    .eq("pool_id", pool.id)
    .order("stage")
    .order("bonus_points", { ascending: false });

  const riderIds = [...new Set((bonuses ?? []).map((b) => b.rider_id))];
  const { data: riders } = await sb
    .from("riders")
    .select("id, full_name")
    .in("id", riderIds);
  const riderMap = new Map((riders ?? []).map((r) => [r.id, r.full_name]));

  for (const b of bonuses ?? []) {
    console.log(`  Stage ${b.stage}: ${riderMap.get(b.rider_id) ?? b.rider_id} → ${b.bonus_points} pts`);
  }

  // 2. Check stage_jersey_leaders coverage (what stages are "locked" for re-scrape)
  console.log("\n=== stage_jersey_leaders coverage (stages that won't be re-scraped) ===");
  const { data: jerseyStages } = await sb
    .from("stage_jersey_leaders")
    .select("stage, classification")
    .eq("pool_id", pool.id)
    .order("stage");
  const byStage = new Map<number, string[]>();
  for (const j of jerseyStages ?? []) {
    const arr = byStage.get(j.stage) ?? [];
    arr.push(j.classification);
    byStage.set(j.stage, arr);
  }
  for (const [stage, cls] of [...byStage.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  Stage ${stage}: ${cls.join(", ")}`);
  }

  // 3. Stages in stage_jersey_leaders but NOT in stage_youth_bonus (missing bonuses)
  console.log("\n=== Stages with jersey data but NO youth bonus rows ===");
  const stagesWithBonus = new Set((bonuses ?? []).map((b) => b.stage));
  for (const stage of byStage.keys()) {
    if (!stagesWithBonus.has(stage)) {
      console.log(`  Stage ${stage}: has jersey leaders but NO youth bonus rows`);
    }
  }

  // 4. Check v_rider_stage_points for del toro specifically
  console.log("\n=== v_rider_stage_points for youth-bonus riders ===");
  const { data: rsp } = await sb
    .from("v_rider_stage_points")
    .select("stage, rider_name, points, position")
    .eq("pool_id", pool.id)
    .in("rider_id", riderIds)
    .order("stage");
  for (const r of rsp ?? []) {
    console.log(`  Stage ${r.stage} | pos ${r.position ?? "?"} | ${r.rider_name}: ${r.points} pts total`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
