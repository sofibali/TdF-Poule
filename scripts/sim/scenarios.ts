/**
 * Rule scenarios to test against the 2025 teams. Add/edit RuleSets here, then
 * run `npx tsx scripts/sim/run.ts` to see each one's leaderboard and how it
 * shuffles ranks vs. the current rules.
 *
 * A RuleSet's stagePoints / gcPoints are just position -> points maps, so you
 * can change the values, award more (or fewer) positions, flatten the curve,
 * etc. Anything not listed scores 0.
 */
import type { RuleSet } from "./engine";
import { CURRENT_RULES } from "./engine";

/** helper: build a position->points map from an array (index 0 = 1st place). */
export const table = (pts: number[]): Record<number, number> =>
  Object.fromEntries(pts.map((p, i) => [i + 1, p]));

export const SCENARIOS: RuleSet[] = [
  // ---- Example proposals — replace these with the family's real ideas. ----

  // A) Reward depth: pay top 15 in stages (flatter tail) instead of top 10.
  {
    name: "A: stages pay top 15",
    stagePoints: table([20, 16, 13, 11, 9, 8, 7, 6, 5, 4, 3, 3, 2, 2, 1]),
    gcPoints: CURRENT_RULES.gcPoints,
    reserveLockStage: 6,
    gcMainsOnly: true,
  },

  // B) Make GC matter less relative to stages (halve GC values).
  {
    name: "B: GC weight halved",
    stagePoints: CURRENT_RULES.stagePoints,
    gcPoints: table([50, 40, 30, 20, 15, 13, 10, 9, 8, 8]),
    reserveLockStage: 6,
    gcMainsOnly: true,
  },

  // C) Flatten stage podium (less reward for winning the stage).
  {
    name: "C: flatter stage podium",
    stagePoints: table([12, 10, 9, 8, 7, 6, 5, 4, 3, 2]),
    gcPoints: CURRENT_RULES.gcPoints,
    reserveLockStage: 6,
    gcMainsOnly: true,
  },
];
