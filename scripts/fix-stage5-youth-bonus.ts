#!/usr/bin/env tsx
/**
 * Fixes stage 5 missing youth bonus:
 * 1. Deletes stage 5 jersey_leaders so the scraper re-fetches it.
 * 2. Re-runs fetchLetourStageJerseys(5) and writes correct youth bonus.
 *
 * Run: npx tsx scripts/fix-stage5-youth-bonus.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
import { fetchLetourStageJerseys } from "../lib/scraper/letour";

config({ path: join(__dirname, "..", ".env.local") });
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data: pool } = await sb.from("pools").select("id").eq("year", 2026).single();
  if (!pool) { console.error("No 2026 pool"); process.exit(1); }

  const poolId = pool.id;
  const stage = 5;

  // Build name→rider_id map
  const { data: riders } = await sb
    .from("riders")
    .select("id, full_name")
    .eq("pool_id", poolId);
  const ridByName = new Map((riders ?? []).map((r) => [r.full_name.toLowerCase(), r.id]));

  // 1. Delete stale jersey_leaders for stage 5
  const { error: delErr } = await sb
    .from("stage_jersey_leaders")
    .delete()
    .eq("pool_id", poolId)
    .eq("stage", stage);
  if (delErr) { console.error("Delete failed:", delErr.message); process.exit(1); }
  console.log("Cleared stage 5 jersey_leaders.");

  // 2. Re-fetch jerseys + youth bonus
  console.log("Fetching letour.fr stage 5 jerseys...");
  const { youthAwards, holders } = await fetchLetourStageJerseys(stage);
  console.log("Youth awards:", youthAwards);
  console.log("Jersey holders:", holders);

  // 3. Write jersey holders back
  const holderEntries: [string, string | undefined | null][] = [
    ["gc", holders.gc],
    ["points", holders.points],
    ["mountain", holders.mountain],
    ["youth_leader", holders.youth],
  ];
  const holderRows = holderEntries
    .filter((e): e is [string, string] => Boolean(e[1]))
    .map(([classification, name]) => ({
      pool_id: poolId,
      stage,
      classification,
      raw_name: name,
      rider_id: ridByName.get(name.toLowerCase()) ?? null,
    }));
  if (holderRows.length) {
    const { error } = await sb
      .from("stage_jersey_leaders")
      .upsert(holderRows, { onConflict: "pool_id,stage,classification" });
    if (error) console.error("Jersey upsert error:", error.message);
    else console.log(`Wrote ${holderRows.length} jersey holder rows.`);
  }

  // 4. Write youth bonus
  if (youthAwards.length === 0) {
    console.warn("WARNING: No youth awards returned from letour.fr — stage 5 may not be available yet.");
    process.exit(0);
  }
  const bonusRows = youthAwards
    .map(({ rider, bonusPoints }) => {
      const rider_id = ridByName.get(rider.toLowerCase()) ?? null;
      if (!rider_id) { console.warn(`  No rider_id for "${rider}"`); return null; }
      return { pool_id: poolId, stage, rider_id, bonus_points: bonusPoints };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (bonusRows.length) {
    const { error } = await sb
      .from("stage_youth_bonus")
      .upsert(bonusRows, { onConflict: "pool_id,stage,rider_id" });
    if (error) console.error("Youth bonus upsert error:", error.message);
    else console.log(`Wrote ${bonusRows.length} youth bonus rows for stage 5.`);
  } else {
    console.warn("No youth bonus rows matched — check rider name mapping.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
