#!/usr/bin/env tsx
/**
 * Alternate-points scenarios for the 2026 pool. Answers four "what if we scored
 * it differently" questions the family asked about:
 *
 *   1. Youth bonus  — how many extra points did the tiered white-jersey bonus
 *      (stage_youth_bonus, migration 0021) actually add per team, and how did
 *      it change the spread (stddev) of the league?
 *   2. Green jersey per-stage bonus — a NEW proposed rule: pay a bonus every
 *      stage to whichever team owns that stage's green-jersey (points
 *      classification) leader, mirroring how the youth bonus already works.
 *      Not scored today — stage_jersey_leaders is currently backup-only data.
 *   3. Reserve lock stage — sensitivity check: what if reserves could sub in
 *      through a different stage than the official rule (10)?
 *   4. Unique rider bonus — a NEW proposed rule: bonus points when a team's
 *      scoring rider was drafted as a MAIN by no other team (rewards
 *      distinctive drafting instead of everyone chasing the same favorites).
 *
 * Run:  npx tsx scripts/sim/snapshot-2025.ts 2026   (refresh the data first)
 *       npx tsx scripts/sim/alt-points-2026.ts [year] [greenBonus] [uniqueBonus]
 *
 * Everything runs offline from scripts/sim/data/<year>.json.
 */
import { join } from "node:path";
import { readFileSync } from "node:fs";
import {
  score,
  riderOwnershipCounts,
  CURRENT_RULES_2026,
  type Snapshot,
  type RuleSet,
  type TeamScore,
} from "./engine";

const YEAR = Number(process.argv[2] ?? 2026);
const GREEN_BONUS = Number(process.argv[3] ?? 4); // points per stage, same tier as the current youth flat rate
const UNIQUE_BONUS = Number(process.argv[4] ?? 2); // flat points per unique-rider scoring event

function loadSnapshot(year: number): Snapshot {
  return JSON.parse(readFileSync(join(__dirname, "data", `${year}.json`), "utf8"));
}

function stddev(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function totalsOf(rows: TeamScore[]): number[] {
  return rows.map((r) => r.total);
}

function printDelta(title: string, base: TeamScore[], scenario: TeamScore[]) {
  const baseById = new Map(base.map((s) => [s.teamId, s]));
  console.log(`\n${"=".repeat(78)}\n${title}\n${"=".repeat(78)}`);
  console.log("  team                              extra pts   new total   Δrank");
  const rows = [...scenario].sort((a, b) => {
    const ea = a.total - baseById.get(a.teamId)!.total;
    const eb = b.total - baseById.get(b.teamId)!.total;
    return eb - ea;
  });
  for (const r of rows) {
    const b = baseById.get(r.teamId)!;
    const extra = r.total - b.total;
    const dRank = b.rank - r.rank;
    const arrow = dRank > 0 ? `▲${dRank}` : dRank < 0 ? `▼${-dRank}` : "  =";
    console.log(
      `  ${r.name.slice(0, 32).padEnd(32)} ${String(extra >= 0 ? "+" + extra : extra).padStart(9)}   ` +
        `${String(r.total).padStart(9)}   ${arrow.padStart(5)}`,
    );
  }
  const baseSd = stddev(totalsOf(base));
  const scenSd = stddev(totalsOf(scenario));
  const movedRank = rows.filter((r) => baseById.get(r.teamId)!.rank !== r.rank).length;
  console.log(
    `\n  stddev of team totals: baseline=${baseSd.toFixed(1)}  scenario=${scenSd.toFixed(1)}  ` +
      `(Δ${(scenSd - baseSd >= 0 ? "+" : "") + (scenSd - baseSd).toFixed(1)})`,
  );
  console.log(`  ${movedRank}/${rows.length} teams change rank.`);
}

function main() {
  const snap = loadSnapshot(YEAR);
  const baseline = score(snap, CURRENT_RULES_2026);

  // ---- 1. Youth bonus: with (real rule) vs without ----------------------
  const noYouth: RuleSet = { ...CURRENT_RULES_2026, name: "No youth bonus", youthBonusEnabled: false };
  const withoutYouth = score(snap, noYouth);
  printDelta(
    `1. YOUTH BONUS — value of the tiered white-jersey bonus (${YEAR})\n` +
      `   (baseline HAS the bonus; this table shows what teams gain BY HAVING it —\n` +
      `    i.e. baseline total minus a run with youthBonusEnabled:false)`,
    withoutYouth,
    baseline,
  );

  // ---- 2. Green jersey per-stage bonus (new proposed rule) ---------------
  const withGreen: RuleSet = {
    ...CURRENT_RULES_2026,
    name: `+${GREEN_BONUS}/stage green jersey bonus`,
    jerseyStageBonusPoints: { points: GREEN_BONUS },
  };
  const greenScenario = score(snap, withGreen);
  printDelta(
    `2. GREEN JERSEY PER-STAGE BONUS — proposed +${GREEN_BONUS} pts/stage to whoever\n` +
      `   owns that stage's points-classification leader (${YEAR})`,
    baseline,
    greenScenario,
  );

  // ---- 3. Reserve lock stage sensitivity ---------------------------------
  console.log(`\n${"=".repeat(78)}\n3. RESERVE LOCK STAGE — sensitivity vs the official lock (stage 10)\n${"=".repeat(78)}`);
  const lockStages = [4, 6, 8, 10, 12, 15, 18, 21];
  const baseByTeam = new Map(baseline.map((s) => [s.teamId, s]));
  for (const lock of lockStages) {
    const rules: RuleSet = { ...CURRENT_RULES_2026, name: `lock=${lock}`, reserveLockStage: lock };
    const rows = score(snap, rules);
    const sd = stddev(totalsOf(rows));
    const movedRank = rows.filter((r) => baseByTeam.get(r.teamId)!.rank !== r.rank).length;
    const winner = rows.find((r) => r.rank === 1)!;
    const marker = lock === 10 ? "  <-- official rule" : "";
    console.log(
      `  lock=${String(lock).padStart(2)}  stddev=${sd.toFixed(1).padStart(6)}  ` +
        `${movedRank}/${rows.length} ranks moved  winner=${winner.name}${marker}`,
    );
  }

  // ---- 4. Unique rider bonus (new proposed rule) -------------------------
  const ownership = riderOwnershipCounts(snap);
  console.log(`\n${"=".repeat(78)}\n4. UNIQUE RIDERS — mains drafted by exactly one team (${YEAR})\n${"=".repeat(78)}`);
  for (const t of snap.teams) {
    const uniqueMains = snap.teamRiders
      .filter((p) => p.team_id === t.id && !p.is_reserve && p.rider_id && ownership.get(p.rider_id) === 1)
      .map((p) => snap.riderNames[p.rider_id as string] ?? p.raw_name);
    console.log(`  ${t.name.slice(0, 32).padEnd(32)} ${uniqueMains.length ? uniqueMains.join(", ") : "(none)"}`);
  }
  const withUnique: RuleSet = {
    ...CURRENT_RULES_2026,
    name: `+${UNIQUE_BONUS}/event unique-rider bonus`,
    uniqueRiderBonusPoints: UNIQUE_BONUS,
  };
  const uniqueScenario = score(snap, withUnique);
  printDelta(
    `4b. UNIQUE RIDER BONUS — proposed +${UNIQUE_BONUS} pts whenever a scoring rider\n` +
      `    was drafted as a main by only one team (${YEAR})`,
    baseline,
    uniqueScenario,
  );
}

main();
