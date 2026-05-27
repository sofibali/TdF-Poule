-- ============================================================================
-- Defensive fixes to the leaderboard + matrix views: add pool_id to all
-- left-joins that aggregate by (team_id, pool_id). team_id is globally unique
-- today so these joins WERE coincidentally correct, but if anything ever
-- causes the same team_id to appear in multiple pools (manual data juggling,
-- mid-Tour rename, future schema change), we'd silently produce wrong scores.
--
-- Re-runnable: views use CREATE OR REPLACE; only the body changes.
-- ============================================================================

-- v_team_stage_matrix: was joining v_team_stage_points only on team_id, but
-- the view groups by (team_id, pool_id) so the pool_id should be explicit.
create or replace view public.v_team_stage_matrix as
  select
    p.year,
    t.id    as team_id,
    t.name  as team_name,
    t.player_name,
    s.stage,
    coalesce(s.points, 0) as points
  from public.teams t
  join public.pools p on p.id = t.pool_id
  left join public.v_team_stage_points s
    on s.team_id = t.id
   and s.pool_id = t.pool_id;

-- v_leaderboard: same fix for both joins (stage_totals + v_team_gc_points).
-- Also re-clarify the partition: rank is computed per-pool so each year's
-- standings are independent.
create or replace view public.v_leaderboard as
  with stage_totals as (
    select team_id, pool_id, sum(points) as stage_points
    from public.v_team_stage_points
    group by team_id, pool_id
  )
  select
    t.id          as team_id,
    t.pool_id,
    p.year,
    t.name,
    t.player_name,
    coalesce(st.stage_points, 0) + coalesce(g.points, 0) as total_points,
    coalesce(st.stage_points, 0) as stage_points,
    coalesce(g.points, 0)        as gc_points,
    rank() over (
      partition by t.pool_id
      order by coalesce(st.stage_points, 0) + coalesce(g.points, 0) desc
    ) as rank
  from public.teams t
  join public.pools p on p.id = t.pool_id
  left join stage_totals st
    on st.team_id = t.id
   and st.pool_id = t.pool_id
  left join public.v_team_gc_points g
    on g.team_id = t.id
   and g.pool_id = t.pool_id;
