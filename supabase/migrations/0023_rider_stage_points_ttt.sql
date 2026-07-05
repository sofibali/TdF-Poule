-- Fix v_rider_stage_points to use scoring_position for TTT stages.
--
-- Before: spt.position = sr.position → only top-N individual finishers get
-- points; in a TTT the 8 riders on team 1 have individual positions 1, 7, 43,
-- 59 … so only position-1 rider got 20 pts; the rest got their real position's
-- (lower) points or nothing.
--
-- After: spt.position = COALESCE(sr.scoring_position, sr.position) → same as
-- v_team_stage_points. For TTT all 8 riders on team-rank-1 look up position 1
-- → 20 pts each. For normal stages scoring_position is null so behaviour is
-- unchanged.
--
-- Requires: migration 0020 (scoring_position column on stage_results).

create or replace view public.v_rider_stage_points as
  select
    sr.pool_id,
    sr.stage,
    sr.rider_id,
    sr.raw_name as rider_name,
    sr.position,
    coalesce(spt.points, 0) as points
  from public.stage_results sr
  left join public.stage_point_table spt
    on spt.position = coalesce(sr.scoring_position, sr.position)
  where coalesce(spt.points, 0) > 0;
