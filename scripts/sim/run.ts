#!/usr/bin/env tsx
/**
 * Run the rules simulator over the 2025 snapshot.
 *
 *   npx tsx scripts/sim/run.ts            # all scenarios in scenarios.ts
 *   npx tsx scripts/sim/run.ts 2024       # use a different year's snapshot
 *
 * For each scenario it prints the full leaderboard and, next to each team, how
 * its rank and total moved vs. the CURRENT rules. A summary at the end flags how
 * many teams changed rank and whether the winner changes.
 *
 * Everything runs offline from scripts/sim/data/<year>.json — snapshot first
 * with `npx tsx scripts/sim/snapshot-2025.ts`.
 */
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { score, CURRENT_RULES, type Snapshot, type RuleSet, type TeamScore } from "./engine";
import { SCENARIOS } from "./scenarios";

const YEAR = Number(process.argv[2] ?? 2025);

function loadSnapshot(year: number): Snapshot {
  return JSON.parse(readFileSync(join(__dirname, "data", `${year}.json`), "utf8"));
}

const arrow = (d: number) => (d > 0 ? `▲${d}` : d < 0 ? `▼${-d}` : "  =");

function printLeaderboard(
  title: string,
  rows: TeamScore[],
  baseByTeam: Map<string, TeamScore>,
) {
  console.log(`\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`);
  console.log("  #  team                         stage   gc   total   Δrank  Δtot");
  for (const r of rows) {
    const base = baseByTeam.get(r.teamId)!;
    const dRank = base.rank - r.rank; // positive = moved up
    const dTot = r.total - base.total;
    console.log(
      `${String(r.rank).padStart(3)}  ${r.name.slice(0, 26).padEnd(26)} ` +
        `${String(r.stagePoints).padStart(5)} ${String(r.gcPoints).padStart(4)} ` +
        `${String(r.total).padStart(6)}   ${arrow(dRank).padStart(5)}  ${(dTot >= 0 ? "+" : "") + dTot}`,
    );
  }
}

function summary(rows: TeamScore[], baseByTeam: Map<string, TeamScore>) {
  const movedRank = rows.filter((r) => baseByTeam.get(r.teamId)!.rank !== r.rank).length;
  const baseWinner = [...baseByTeam.values()].find((b) => b.rank === 1)!;
  const newWinner = rows.find((r) => r.rank === 1)!;
  const winnerChanged = baseWinner.teamId !== newWinner.teamId;
  console.log(
    `\n  → ${movedRank}/${rows.length} teams change rank. ` +
      `Winner: ${winnerChanged ? `CHANGES ${baseWinner.name} → ${newWinner.name}` : `unchanged (${newWinner.name})`}`,
  );
}

function main() {
  const snap = loadSnapshot(YEAR);

  const base = score(snap, CURRENT_RULES);
  const baseByTeam = new Map(base.map((s) => [s.teamId, s]));
  printLeaderboard(`BASELINE — ${CURRENT_RULES.name} (${YEAR})`, base, baseByTeam);

  for (const rules of SCENARIOS) {
    const rows = score(snap, rules);
    printLeaderboard(`SCENARIO — ${rules.name} (${YEAR})`, rows, baseByTeam);
    summary(rows, baseByTeam);
  }
}

main();
