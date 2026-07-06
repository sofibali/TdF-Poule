-- v_rider_stage_points previously returned only stage-finish points from
-- stage_point_table, so young riders' youth bonus was invisible on the team
-- detail page (the roster card showed finish pts only, not finish + bonus).
-- This view is only used for per-rider display; team scoring already uses
-- v_team_stage_points which joins stage_youth_bonus correctly.

create or replace view public.v_rider_stage_points as
  select
    sr.pool_id,
    sr.stage,
    sr.rider_id,
    sr.raw_name                                        as rider_name,
    sr.position,
    coalesce(spt.points, 0) + coalesce(syb.bonus_points, 0) as points
  from public.stage_results sr
  left join public.stage_point_table spt
    on spt.position = sr.position
  left join public.stage_youth_bonus syb
    on syb.pool_id = sr.pool_id
   and syb.stage   = sr.stage
   and syb.rider_id = sr.rider_id
  where coalesce(spt.points, 0) + coalesce(syb.bonus_points, 0) > 0;
