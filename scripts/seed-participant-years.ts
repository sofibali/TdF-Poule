#!/usr/bin/env tsx
/**
 * Seeds participant-only pools for years 1991–2002 and 2004–2014.
 *
 * These years have placement data in Winners_byYear.xlsx but no team picks.
 * Each participant gets an empty team (no riders). The Relive page will show
 * the participant names only; the leaderboard shows the historical banner.
 *
 * Run:  npx tsx scripts/seed-participant-years.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";

config({ path: join(__dirname, "..", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Placement data extracted from Winners_byYear.xlsx "Place By Year" tab.
// Format: [player, placement]  (names trimmed)
const PARTICIPANT_YEARS: Record<number, [string, number][]> = {
  1991: [["Roeland", 1], ["Han", 2], ["Lori", 3], ["Koert", 4], ["Rein", 7]],
  1992: [["Ali", 1], ["Koert", 3], ["Roeland", 4], ["Han", 5], ["Rein", 7], ["Lori", 8]],
  1993: [["Freek", 1], ["Ali", 2], ["Lori", 4], ["Rein", 6], ["Han", 7], ["Koert", 10], ["Roeland", 12]],
  1994: [["Koert", 1], ["Han", 2], ["Freek", 3], ["Ali", 4], ["Lori", 5], ["Rein", 6]],
  1995: [["Rich", 1], ["Han", 2], ["Ali", 3], ["Koert", 4], ["Freek", 5], ["Rein", 6], ["Lori", 8]],
  1996: [["Koert", 1], ["Roeland", 2], ["Rein", 4], ["Han", 5], ["Rich", 6], ["Ali", 7], ["Lori", 8], ["Freek", 9]],
  1997: [["Ali", 1]],
  1998: [["Freek", 1], ["Rein", 2], ["Han", 3], ["Lori", 4], ["Ali", 5], ["Rich", 7], ["Koert", 8], ["Tosca", 9]],
  1999: [["Ali", 1], ["Rich", 2], ["Han", 3], ["Koert", 4], ["Tosca", 5], ["Lori", 6], ["Freek", 8], ["Rein", 10]],
  2000: [["Rich", 1], ["Ali", 2], ["Gerard", 3], ["Koert", 4], ["Tosca", 5], ["Lori", 6], ["Han", 8], ["Freek", 9], ["Rein", 10]],
  2001: [["Tosca", 1], ["Lori", 2], ["Han", 3], ["Koert", 4], ["Rein", 5], ["Rich", 6], ["Gerard", 7], ["Freek", 8]],
  2002: [["Han", 1], ["Rich", 2], ["Lori", 3], ["Tosca", 3], ["Rein", 5], ["Koert", 6], ["Quinten", 7]],
  // 2003 is already seeded with full team picks — skipped here
  2004: [["Rich", 1], ["Quinten", 2], ["Tosca", 4], ["Lori", 5], ["Eelco", 6], ["Koert", 7], ["Freek", 8], ["Rein", 9], ["Gerard", 10], ["Jan", 11], ["Han", 13]],
  2005: [["Han", 1], ["Gerard", 2], ["Rich", 3], ["Koert", 4], ["Jan", 5], ["Eelco", 6], ["Lori", 7], ["Quinten", 8], ["Kielen", 9], ["Freek", 10], ["Rein", 11], ["Reg", 12]],
  2006: [["Lori", 1], ["Kielen", 2], ["Han", 3], ["Gerard", 4], ["Koert", 5], ["Rich", 6], ["Quinten", 7], ["Eelco", 8]],
  2007: [["Char", 1], ["Quinten", 2], ["Lori", 3], ["Rich", 4], ["Han", 5], ["Kielen", 6], ["Gerard", 7], ["Koert", 8], ["Eelco", 9], ["Freek", 10], ["Rein", 11]],
  2008: [["Char", 1], ["Quinten", 2], ["Lori", 3], ["Han", 4], ["Kielen", 5], ["Koert", 7], ["Rich", 8], ["Freek", 9], ["Eelco", 10]],
  2009: [["Quinten", 1], ["Eelco", 2], ["Rein", 3], ["Char", 4], ["Han", 5], ["Gerard", 6], ["Lori", 7], ["Kielen", 8], ["Rich", 9], ["Koert", 10]],
  2010: [["Gerard", 1], ["Rich", 2], ["Koert", 4], ["Lori", 5], ["Quinten", 6], ["Char", 7], ["Eelco", 8], ["Han", 9], ["Kielen", 10], ["Freek", 12], ["Rein", 13]],
  2011: [["Quinten", 2], ["Han", 3], ["Koert", 4], ["Gerard", 5], ["Char", 6], ["Kielen", 7], ["Lori", 8], ["Rein", 9], ["Rich", 10]],
  2012: [["Freek", 2], ["Gerard", 3], ["Quinten", 4], ["Lori", 5], ["Kielen", 6], ["Han", 7], ["Koert", 8]],
  2013: [["Quinten", 3], ["Karin", 4], ["Kielen", 5], ["Freek", 6], ["Rich", 7], ["Lori", 8], ["Hubert", 9], ["Koert", 10]],
  2014: [["Freek", 1], ["Lori", 2], ["Quinten", 3], ["Karin", 4], ["Kielen", 5], ["Han", 6], ["Hubert", 7], ["Rich", 8], ["Koert", 9]],
};

async function seedYear(year: number, participants: [string, number][]) {
  console.log(`\n--- ${year} (${participants.length} participants) ---`);

  // 1) Check if pool already exists
  const { data: existing } = await supabase
    .from("pools")
    .select("id")
    .eq("year", year)
    .maybeSingle();

  let poolId: string;
  if (existing?.id) {
    poolId = existing.id;
    // Check if teams already exist — skip if they do
    const { count } = await supabase
      .from("teams")
      .select("*", { count: "exact", head: true })
      .eq("pool_id", poolId);
    if ((count ?? 0) > 0) {
      console.log(`  Already has ${count} teams — skipping`);
      return;
    }
    console.log(`  Pool exists (${poolId}) — adding teams`);
  } else {
    // Create new pool
    const { data: newPool, error } = await supabase
      .from("pools")
      .insert({ year, reserves_allowed: 3, name: `Tour de France ${year}` })
      .select("id")
      .single();
    if (error || !newPool) {
      console.error(`  Failed to create pool for ${year}:`, error?.message);
      return;
    }
    poolId = newPool.id;
    console.log(`  Created pool ${poolId}`);
  }

  // 2) Insert teams (no riders — participant names only)
  const teams = participants.map(([player]) => ({
    pool_id: poolId,
    name: `${player}'s Team`,
    player_name: player,
  }));

  const { error: teamErr } = await supabase.from("teams").insert(teams);
  if (teamErr) {
    console.error(`  Failed to insert teams:`, teamErr.message);
  } else {
    console.log(`  Inserted ${teams.length} teams`);
  }
}

async function main() {
  console.log("Seeding participant-only years (1991–2002, 2004–2014)...");
  for (const [yearStr, participants] of Object.entries(PARTICIPANT_YEARS)) {
    await seedYear(parseInt(yearStr, 10), participants);
  }
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
