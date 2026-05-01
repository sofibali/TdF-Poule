-- ============================================================================
-- Views for the new "Riders" + "All teams · stages" pages.
--
-- v_rider_stage_points   one row per (rider, stage) with points scored
-- v_rider_totals         one row per rider with stage totals + GC + grand total
-- v_team_stage_matrix    pivot: team × stage already exists as v_team_stage_points;
--                        this view adds team display fields for direct rendering
-- v_perfect_team         the top-N rider rows for a year — what the optimal
--                        roster would have looked like in hindsight.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- v_rider_stage_points
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- v_rider_totals
--
-- Aggregates per-rider points across stages + GC. rider_name is preferred from
-- the riders table (canonical); falls back to raw_name when unmatched.
-- ----------------------------------------------------------------------------
create or replace view public.v_rider_totals as
  with stage_pts as (
    select
      pool_id,
      coalesce(rider_id::text, lower(rider_name)) as rider_key,
      coalesce(rider_id, null) as rider_id,
      max(rider_name) as rider_name,
      sum(points) as stage_points
    from public.v_rider_stage_points
    group by pool_id, coalesce(rider_id::text, lower(rider_name))
  ),
  gc_pts as (
    select
      fg.pool_id,
      coalesce(fg.rider_id::text, lower(fg.raw_name)) as rider_key,
      coalesce(fg.rider_id, null) as rider_id,
      max(fg.raw_name) as rider_name,
      sum(coalesce(gpt.points, 0)) as gc_points
    from public.final_gc fg
    left join public.gc_point_table gpt on gpt.position = fg.position
    where coalesce(gpt.points, 0) > 0
    group by fg.pool_id, coalesce(fg.rider_id::text, lower(fg.raw_name))
  ),
  combined as (
    select pool_id, rider_key, rider_id, rider_name, stage_points, 0::bigint as gc_points
      from stage_pts
    union all
    select pool_id, rider_key, rider_id, rider_name, 0::bigint as stage_points, gc_points
      from gc_pts
  )
  select
    pool_id,
    rider_key,
    max(rider_id::text)::uuid as rider_id,
    max(rider_name) as rider_name,
    sum(stage_points) as stage_points,
    sum(gc_points)    as gc_points,
    sum(stage_points + gc_points) as total_points,
    rank() over (
      partition by pool_id
      order by sum(stage_points + gc_points) desc
    ) as overall_rank
  from combined
  group by pool_id, rider_key;

-- ----------------------------------------------------------------------------
-- v_team_stage_matrix
--
-- Renames + decorates v_team_stage_points so the /matrix page can render
-- without joining on its own.
-- ----------------------------------------------------------------------------
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
  left join public.v_team_stage_points s on s.team_id = t.id;

-- ----------------------------------------------------------------------------
-- v_perfect_team
--
-- Top N (default 15 — the standard roster size) rider rows for a given pool,
-- representing the perfect retrospective pick. Page filters by year.
-- ----------------------------------------------------------------------------
create or replace view public.v_perfect_team as
  select *
  from public.v_rider_totals
  where overall_rank <= 15;

-- RLS already permits anon SELECT on the underlying tables. Views inherit
-- their reading rules from those, so no extra policies needed.
