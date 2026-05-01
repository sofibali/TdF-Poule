// Hand-written DB types — committed to git, kept in sync with supabase/migrations/.
// Auto-generated types from `npm run db:types` go to lib/db/types.gen.ts (gitignored)
// and can be imported alongside these as a sanity check.

export type MatchStatus = "matched" | "ambiguous" | "unmatched" | "manual";

export type Pool = {
  id: string;
  year: number;
  name: string;
  start_date: string | null;
  deadline: string | null;
  num_stages: number;
  reserves_allowed: number;
  notes: string | null;
  created_at: string;
};

export type Rider = {
  id: string;
  pool_id: string;
  full_name: string;
  last_name: string;
  pcs_slug: string | null;
  pro_team: string | null;
  bib_number: number | null;
  created_at: string;
};

export type RiderDropout = {
  pool_id: string;
  rider_id: string;
  dropout_after_stage: number;
  reason: string | null;
};

export type Team = {
  id: string;
  pool_id: string;
  name: string;
  player_name: string | null;
  source_doc: string | null;
  created_at: string;
};

export type MatchCandidate = {
  rider_id: string;
  full_name: string;
  pro_team: string | null;
};

export type TeamRider = {
  id: string;
  team_id: string;
  rider_id: string | null;
  raw_name: string;
  is_reserve: boolean;
  reserve_order: number | null;
  pick_order: number | null;
  match_status: MatchStatus;
  match_candidates: MatchCandidate[] | null;
  admin_note: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
};

export type StageResult = {
  pool_id: string;
  stage: number;
  position: number;
  rider_id: string | null;
  raw_name: string;
  fetched_at: string;
};

export type FinalGcResult = {
  pool_id: string;
  position: number;
  rider_id: string | null;
  raw_name: string;
  fetched_at: string;
};

export type LeaderboardRow = {
  team_id: string;
  pool_id: string;
  year: number;
  name: string;
  player_name: string | null;
  total_points: number;
  stage_points: number;
  gc_points: number;
  rank: number;
};

export type RiderTotalsRow = {
  pool_id: string;
  rider_id: string | null;
  rider_name: string;
  // Joined from riders table when rider_id is resolved; null until then.
  pro_team: string | null;
  bib_number: number | null;
  pcs_slug: string | null;
  stage_points: number;
  gc_points: number;
  total_points: number;
  overall_rank: number;
};

export type RiderStagePointsRow = {
  pool_id: string;
  stage: number;
  rider_id: string | null;
  rider_name: string;
  position: number;
  points: number;
};

export type TeamStageMatrixRow = {
  year: number;
  team_id: string;
  team_name: string;
  player_name: string | null;
  stage: number;
  points: number;
};

export type UnresolvedPick = {
  team_rider_id: string;
  team_id: string;
  pool_id: string;
  year: number;
  team_name: string;
  raw_name: string;
  is_reserve: boolean;
  reserve_order: number | null;
  match_status: MatchStatus;
  match_candidates: MatchCandidate[] | null;
  admin_note: string | null;
};
