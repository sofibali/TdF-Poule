#!/usr/bin/env tsx
/**
 * Snapshot the 2025 pool into a local JSON file so the rules simulator can run
 * fully offline (no DB round-trips while iterating on scenarios).
 *
 * Pulls exactly what scoring needs:
 *   - teams (id, name, player_name)
 *   - team_riders (rider_id, is_reserve, reserve_order, pick_order, match_status, raw_name)
 *   - stage_results (stage, position, rider_id)   -- only top 10 score, but we keep all
 *   - final_gc (position, rider_id)
 *   - rider_dropouts (rider_id, dropout_after_stage)
 *   - rider names (id -> full_name) for readable output
 *
 * Run:  npx tsx scripts/sim/snapshot-2025.ts [year]
 * Out:  scripts/sim/data/<year>.json
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";

config({ path: join(__dirname, "..", "..", ".env.local") });
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const YEAR = Number(process.argv[2] ?? 2025);

/**
 * Fetch every row from a table for a pool, paging past PostgREST's 1000-row cap.
 * (The first cut of this script silently truncated stage_results at 1000 rows,
 * dropping stage 21 entirely.)
 */
async function fetchAll(
  table: string,
  columns: string,
  poolId: string,
): Promise<any[]> {
  const PAGE = 1000;
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from(table)
      .select(columns)
      .eq("pool_id", poolId)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function main() {
  const { data: pool } = await sb
    .from("pools")
    .select("id, year")
    .eq("year", YEAR)
    .single();
  if (!pool) throw new Error(`No pool for year ${YEAR}`);
  const poolId = pool.id as string;

  const { data: teams } = await sb
    .from("teams")
    .select("id, name, player_name")
    .eq("pool_id", poolId);

  const teamIds = (teams ?? []).map((t) => t.id);
  const { data: teamRiders } = await sb
    .from("team_riders")
    .select("team_id, rider_id, is_reserve, reserve_order, pick_order, match_status, raw_name")
    .in("team_id", teamIds);

  const stageResults = await fetchAll("stage_results", "stage, position, rider_id", poolId);

  const finalGc = await fetchAll("final_gc", "position, rider_id", poolId);

  const dropouts = await fetchAll("rider_dropouts", "rider_id, dropout_after_stage", poolId);

  // Rider names for readable output — gather every rider id we reference.
  const riderIds = new Set<string>();
  for (const r of teamRiders ?? []) if (r.rider_id) riderIds.add(r.rider_id);
  for (const r of stageResults ?? []) if (r.rider_id) riderIds.add(r.rider_id);
  for (const r of finalGc ?? []) if (r.rider_id) riderIds.add(r.rider_id);
  const { data: riders } = await sb
    .from("riders")
    .select("id, full_name")
    .in("id", Array.from(riderIds));
  const riderNames: Record<string, string> = {};
  for (const r of riders ?? []) riderNames[r.id] = r.full_name;

  const snapshot = {
    year: YEAR,
    poolId,
    teams: teams ?? [],
    teamRiders: teamRiders ?? [],
    stageResults: stageResults ?? [],
    finalGc: finalGc ?? [],
    dropouts: dropouts ?? [],
    riderNames,
  };

  const outDir = join(__dirname, "data");
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `${YEAR}.json`);
  writeFileSync(outFile, JSON.stringify(snapshot, null, 2));

  const stages = new Set((stageResults ?? []).map((r) => r.stage));
  console.log(`Wrote ${outFile}`);
  console.log(
    `  teams=${snapshot.teams.length} teamRiders=${snapshot.teamRiders.length} ` +
      `stages=${stages.size} stageRows=${snapshot.stageResults.length} ` +
      `gc=${snapshot.finalGc.length} dropouts=${snapshot.dropouts.length}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
