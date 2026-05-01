// One-shot importer for the historical pool documents.
//
// Run with:  npm run import:csv
//
// Reads files from the parent folder (../*.docx and ../*.csv), parses each
// using lib/parsers/{docx,csv}.ts, and upserts pools/teams/team_riders into
// Supabase using the service-role client. Idempotent: re-running upserts on
// (year), (pool_id, name), and (team_id, raw_name).

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { parsePoolDocx } from "@/lib/parsers/docx";
import { parsePoolCsv } from "@/lib/parsers/csv";
import { createServiceClient } from "@/lib/supabase/server";
import type { ParsedPool } from "@/lib/parsers/types";

// Historical Word docs / CSVs live alongside the app code.
const HISTORICAL_DIR = join(__dirname, "..", "historical-inputs");

// Years where we have BOTH docx and csv — prefer docx (richer formatting).
// 2021 only has csv + pdf. We use the csv.
const PREFER_DOCX = new Set([2020, 2022, 2024, 2025]);

async function loadFile(filename: string): Promise<ParsedPool> {
  const path = join(HISTORICAL_DIR, filename);
  if (filename.toLowerCase().endsWith(".docx")) {
    const buf = await readFile(path);
    return parsePoolDocx(buf, filename);
  }
  const text = await readFile(path, "utf-8");
  return parsePoolCsv(text, filename);
}

async function discover(): Promise<string[]> {
  const all = await readdir(HISTORICAL_DIR);
  const files = all.filter(
    (f) =>
      (f.toLowerCase().endsWith(".docx") || f.toLowerCase().endsWith(".csv")) &&
      /\b(tour|tdf)\b/i.test(f),
  );

  // Group by year, keeping the preferred format.
  const byYear = new Map<number, string>();
  for (const f of files) {
    const m = f.match(/(\d{4})/);
    if (!m) continue;
    const year = parseInt(m[1], 10);
    const prefDocx = PREFER_DOCX.has(year);
    const isDocx = f.toLowerCase().endsWith(".docx");
    const existing = byYear.get(year);
    if (!existing) {
      byYear.set(year, f);
    } else if (prefDocx && isDocx && !existing.toLowerCase().endsWith(".docx")) {
      byYear.set(year, f);
    }
  }
  return [...byYear.values()].sort();
}

async function importPool(parsed: ParsedPool) {
  if (!parsed.year) {
    console.warn(`  skipped: could not detect year (${parsed.source})`);
    return;
  }
  const supabase = createServiceClient();

  // 1) Upsert pool row
  const { data: pool, error: poolErr } = await supabase
    .from("pools")
    .upsert(
      {
        year: parsed.year,
        name: `Tour de France ${parsed.year}`,
        // reserves_allowed = max reserves picked across teams for this year
        reserves_allowed: Math.max(
          3,
          ...parsed.teams.map((t) => t.reserves.length),
        ),
        notes: `Imported from ${parsed.source}`,
      },
      { onConflict: "year" },
    )
    .select()
    .single();

  if (poolErr || !pool) {
    console.error(`  pool upsert failed:`, poolErr);
    return;
  }

  // 2) For each team, upsert and replace its team_riders
  for (const team of parsed.teams) {
    const { data: teamRow, error: teamErr } = await supabase
      .from("teams")
      .upsert(
        {
          pool_id: pool.id,
          name: `${team.player}'s ${team.team_name}`.trim() || team.player,
          player_name: team.player,
          source_doc: parsed.source,
        },
        { onConflict: "pool_id,name" },
      )
      .select()
      .single();
    if (teamErr || !teamRow) {
      console.error(`  team upsert failed for ${team.player}:`, teamErr);
      continue;
    }

    // Wipe existing picks for a clean re-import
    await supabase.from("team_riders").delete().eq("team_id", teamRow.id);

    const picks = [
      ...team.riders.map((raw, idx) => ({
        team_id: teamRow.id,
        raw_name: raw,
        is_reserve: false,
        pick_order: idx + 1,
        // match_status starts as 'unmatched' — the matcher (lib/scoring/match.ts)
        // resolves it once the riders table for this pool exists. Until then,
        // scoring treats unmatched picks as dropouts.
        match_status: "unmatched",
      })),
      ...team.reserves.map((raw, idx) => ({
        team_id: teamRow.id,
        raw_name: raw,
        is_reserve: true,
        reserve_order: idx + 1,
        match_status: "unmatched",
      })),
    ];
    if (picks.length > 0) {
      const { error: pickErr } = await supabase.from("team_riders").insert(picks);
      if (pickErr) console.error(`  team_riders insert failed:`, pickErr);
    }
  }

  // 3) Audit row
  await supabase.from("import_log").insert({
    pool_id: pool.id,
    kind: parsed.source.toLowerCase().endsWith(".docx") ? "teams_docx" : "teams_csv",
    message: `Imported ${parsed.team_count} teams (${parsed.unresolved.length} unresolved).`,
    details: { unresolved: parsed.unresolved },
  });

  console.log(
    `  ✓ ${parsed.year}: ${parsed.team_count} teams imported` +
      (parsed.unresolved.length
        ? ` (${parsed.unresolved.length} need a name: ${parsed.unresolved.join(", ")})`
        : ""),
  );
}

async function main() {
  const files = await discover();
  console.log(`Discovered ${files.length} pool documents:`);
  files.forEach((f) => console.log(`  - ${f}`));

  for (const f of files) {
    try {
      const parsed = await loadFile(f);
      console.log(`\n${f} → year=${parsed.year}, teams=${parsed.team_count}`);
      await importPool(parsed);
    } catch (err) {
      console.error(`  ✗ ${f}:`, err);
    }
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
