#!/usr/bin/env tsx
/**
 * Loads all historical team data from scripts/validator-output/*.json
 * directly into the live Supabase database using the service role key.
 *
 * Run:  npx tsx scripts/seed-historical-direct.ts
 *
 * Uses @supabase/supabase-js directly — no Next.js dependency.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

// Load .env.local
config({ path: join(__dirname, "..", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

type ParsedTeam = {
  player: string;
  team_name: string;
  riders: string[];
  reserves: string[];
  needs_attention: boolean;
};

type ParsedPool = {
  source: string;
  year: number;
  team_count: number;
  teams: ParsedTeam[];
};

const OUTPUT_DIR = join(__dirname, "validator-output");

async function importPool(parsed: ParsedPool) {
  console.log(`\n--- ${parsed.year} (${parsed.source}) — ${parsed.team_count} teams ---`);

  // 1) Upsert pool
  const reservesAllowed = Math.max(3, ...parsed.teams.map((t) => t.reserves.length));
  const { data: pool, error: poolErr } = await supabase
    .from("pools")
    .upsert(
      {
        year: parsed.year,
        name: `Tour de France ${parsed.year}`,
        reserves_allowed: reservesAllowed,
        notes: `Imported from ${parsed.source}`,
      },
      { onConflict: "year" },
    )
    .select()
    .single();

  if (poolErr || !pool) {
    console.error("  Pool upsert failed:", poolErr?.message);
    return;
  }
  console.log(`  Pool: ${pool.id} (year=${parsed.year}, reserves=${reservesAllowed})`);

  // 2) For each team, upsert + insert picks
  let teamsOk = 0;
  let picksTotal = 0;

  for (const team of parsed.teams) {
    const teamLabel = `${team.player}'s ${team.team_name}`.trim() || team.player;

    // Preserve existing manual resolutions before wiping picks
    const { data: existingPicks } = await supabase
      .from("team_riders")
      .select("raw_name, is_reserve, rider_id, match_status, match_candidates")
      .eq("team_id", (
        await supabase
          .from("teams")
          .select("id")
          .eq("pool_id", pool.id)
          .eq("name", teamLabel)
          .maybeSingle()
      ).data?.id ?? "00000000-0000-0000-0000-000000000000");

    const existingByKey = new Map<string, {
      rider_id: string | null;
      match_status: string;
      match_candidates: unknown;
    }>();
    for (const p of existingPicks ?? []) {
      const key = `${p.is_reserve ? "r" : "m"}|${p.raw_name.trim().toLowerCase()}`;
      if (p.match_status === "manual" || p.match_status === "matched") {
        existingByKey.set(key, {
          rider_id: p.rider_id,
          match_status: p.match_status,
          match_candidates: p.match_candidates,
        });
      }
    }

    const { data: teamRow, error: teamErr } = await supabase
      .from("teams")
      .upsert(
        {
          pool_id: pool.id,
          name: teamLabel,
          player_name: team.player,
          source_doc: parsed.source,
        },
        { onConflict: "pool_id,name" },
      )
      .select()
      .single();

    if (teamErr || !teamRow) {
      console.error(`  Team "${team.player}" failed:`, teamErr?.message);
      continue;
    }

    // Wipe existing picks for clean re-import
    await supabase.from("team_riders").delete().eq("team_id", teamRow.id);

    // Build picks, carrying forward any manual resolutions
    const picks = [
      ...team.riders.map((raw, idx) => {
        const key = `m|${raw.trim().toLowerCase()}`;
        const prev = existingByKey.get(key);
        return {
          team_id: teamRow.id,
          raw_name: raw,
          is_reserve: false,
          pick_order: idx + 1,
          match_status: prev?.match_status ?? "unmatched",
          rider_id: prev?.rider_id ?? null,
          match_candidates: prev?.match_candidates ?? null,
        };
      }),
      ...team.reserves.map((raw, idx) => {
        const key = `r|${raw.trim().toLowerCase()}`;
        const prev = existingByKey.get(key);
        return {
          team_id: teamRow.id,
          raw_name: raw,
          is_reserve: true,
          reserve_order: idx + 1,
          match_status: prev?.match_status ?? "unmatched",
          rider_id: prev?.rider_id ?? null,
          match_candidates: prev?.match_candidates ?? null,
        };
      }),
    ];

    if (picks.length > 0) {
      const { error: pickErr } = await supabase.from("team_riders").insert(picks);
      if (pickErr) {
        console.error(`  Picks for "${team.player}" failed:`, pickErr.message);
      } else {
        picksTotal += picks.length;
      }
    }
    teamsOk++;
  }

  // 3) Audit log
  await supabase.from("import_log").insert({
    pool_id: pool.id,
    kind: "teams_csv",
    message: `Seeded ${teamsOk} teams (${picksTotal} picks) from ${parsed.source}`,
  });

  console.log(`  ✓ ${teamsOk} teams, ${picksTotal} picks inserted`);
}

async function main() {
  const files = readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".json")).sort();
  console.log(`Found ${files.length} historical JSON files:`);
  files.forEach((f) => console.log(`  - ${f}`));

  for (const f of files) {
    try {
      const raw = readFileSync(join(OUTPUT_DIR, f), "utf-8");
      const parsed: ParsedPool = JSON.parse(raw);
      await importPool(parsed);
    } catch (err) {
      console.error(`  ✗ ${f}:`, err);
    }
  }

  console.log("\n=== Done! All historical data loaded. ===");
  console.log("Next: go to /admin/refresh on your site and click 'Refresh all'");
  console.log("to fetch stage results from PCS and link riders to picks.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
