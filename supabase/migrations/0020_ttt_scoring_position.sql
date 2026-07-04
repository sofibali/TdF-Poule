-- ============================================================================
-- TTT support: scoring_position column on stage_results.
--
-- A Team Time Trial assigns all riders on the same team the same points
-- (e.g. all 8 Visma riders earn position-1 points because Visma finished
-- 1st). But letour.fr assigns each rider a unique individual position
-- (1-184), so we can't store team rank in the primary key column.
--
-- Fix: add scoring_position (nullable). For normal stages it stays NULL and
-- scoring falls back to position. For TTT stages the live scraper sets it
-- to the team's finishing rank (1 for Visma, 2 for Ineos, etc.) and the
-- scoring view uses that for the point table lookup.
-- ============================================================================

alter table public.stage_results
  add column if not exists scoring_position int check (scoring_position > 0);

-- Rebuild v_team_stage_points to use COALESCE(scoring_position, position).
-- Drop the youth-bonus version (migration 0018) and replace it.
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
      + coalesce(sum(case when jl.rider_id is not null
                          then p.youth_bonus_points else 0 end), 0) as points
  from active a
  join public.pools p on p.id = a.pool_id
  left join public.stage_results sr
    on sr.pool_id = a.pool_id and sr.stage = a.stage and sr.rider_id = a.rider_id
  left join public.stage_point_table spt
    on spt.position = coalesce(sr.scoring_position, sr.position)
  left join public.stage_jersey_leaders jl
    on jl.pool_id = a.pool_id and jl.stage = a.stage
   and jl.classification = 'youth' and jl.rider_id = a.rider_id
  group by a.team_id, a.pool_id, a.stage;
