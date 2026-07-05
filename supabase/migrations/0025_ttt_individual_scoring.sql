-- ============================================================================
-- Official TTT rule (Tour 2026 rules document):
--   "for the team time trial individual bikers receive the points according
--    to the position of that biker in the time trial"
--
-- Reverts the team-rank (scoring_position) approach added in migrations 0020
-- and 0023. Each rider scores for their own individual TTT finish position.
--
-- The scoring_position column on stage_results is kept as archived backup —
-- it holds the team-rank values for Stage 1 but is no longer used for scoring.
-- ============================================================================

-- v_team_stage_points: back to sr.position (no COALESCE with scoring_position)
create or replace view public.v_team_stage_points as
  with stages as (
    select t.id as team_id, t.pool_id, s.stage
    from public.teams t
    cross join generate_series(1, 21) as s(stage)
  ),
  active as (
    select
      st.team_id, st.pool_id, st.stage,
      (public.team_active_riders(st.team_id, st.stage)).rider_id as rider_id
    from stages st
  )
  select
    a.team_id,
    a.pool_id,
    a.stage,
    coalesce(sum(spt.points), 0)
      + coalesce(sum(syb.bonus_points), 0) as points
  from active a
  join public.pools p on p.id = a.pool_id
  left join public.stage_results sr
    on sr.pool_id = a.pool_id and sr.stage = a.stage and sr.rider_id = a.rider_id
  left join public.stage_point_table spt
    on spt.position = sr.position
  left join public.stage_youth_bonus syb
    on syb.pool_id = a.pool_id and syb.stage = a.stage and syb.rider_id = a.rider_id
  group by a.team_id, a.pool_id, a.stage;

-- v_rider_stage_points: back to sr.position
create or replace view public.v_rider_stage_points as
  select
    sr.pool_id,
    sr.stage,
    sr.rider_id,
    sr.raw_name as rider_name,
    sr.position,
    coalesce(spt.points, 0) as points
  from public.stage_results sr
  left join public.stage_point_table spt on spt.position = sr.position
  where coalesce(spt.points, 0) > 0;
