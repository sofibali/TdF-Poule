// TypeScript port of tdf_engine.py.
// TODO (task #3): full implementation — for now this is a typed skeleton with the
// shape Server Components / API routes can call against.

import { STAGE_POINTS, FINAL_POINTS, RESERVE_LOCK_STAGE } from "./rules";

export type StageResult = { position: number; rider: string };
export type Team = { player: string; riders: string[]; reserves: string[] };
export type TeamScore = {
  player: string;
  total: number;
  stagePoints: Record<string, number>;
  riderPoints: Record<string, number>;
};

export function normalizeRiderName(name: string): string {
  return name.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, "");
}

export function findRiderMatch(
  teamRider: string,
  stageRiders: string[],
): string | null {
  const t = normalizeRiderName(teamRider);
  for (const r of stageRiders) {
    const n = normalizeRiderName(r);
    if (n.includes(t) || t.includes(n)) return r;
  }
  return null;
}

export function computeTeamScores(
  team: Team,
  stageResults: Record<number, StageResult[]>,
  finalGc: StageResult[] | null,
): TeamScore {
  // TODO: implement full logic from tdf_engine.py:
  //  - per-stage: lookup STAGE_POINTS[position] for any rider on the active team
  //  - reserve substitution allowed only when stage <= RESERVE_LOCK_STAGE
  //  - final GC: lookup FINAL_POINTS[position]
  void STAGE_POINTS;
  void FINAL_POINTS;
  void RESERVE_LOCK_STAGE;
  void stageResults;
  void finalGc;

  return {
    player: team.player,
    total: 0,
    stagePoints: {},
    riderPoints: {},
  };
}
