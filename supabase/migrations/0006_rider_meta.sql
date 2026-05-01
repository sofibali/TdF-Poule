-- ============================================================================
-- Surface rider meta (pro_team, bib_number, pcs_slug) on the views the UI reads.
--
-- We insert new columns in the middle of the SELECT, which CREATE OR REPLACE
-- VIEW won't allow (it can only append). So drop + recreate. v_perfect_team
-- depends on v_rider_totals so we drop it first; then recreate both.
-- Re-runnable: every drop uses IF EXISTS.
-- ============================================================================

drop view if exists public.v_perfect_team;
drop view if exists public.v_rider_totals;

create view public.v_rider_totals as
  with stage_pts as (
    select
      pool_id,
      coalesce(rider_id::text, lower(rider_name)) as rider_key,
      -- Postgres doesn't have max(uuid); cast to text → max → back to uuid.
      -- Within each group all rider_id values are identical anyway.
      max(rider_id::text)::uuid as rider_id,
      max(rider_name) as rider_name,
      sum(points) as stage_points
    from public.v_rider_stage_points
    group by pool_id, coalesce(rider_id::text, lower(rider_name))
  ),
  gc_pts as (
    select
      fg.pool_id,
      coalesce(fg.rider_id::text, lower(fg.raw_name)) as rider_key,
      max(fg.rider_id::text)::uuid as rider_id,
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
  ),
  agg as (
    select
      pool_id,
      rider_key,
      max(rider_id::text)::uuid as rider_id,
      max(rider_name) as rider_name,
      sum(stage_points) as stage_points,
      sum(gc_points)    as gc_points,
      sum(stage_points + gc_points) as total_points
    from combined
    group by pool_id, rider_key
  )
  select
    a.pool_id,
    a.rider_key,
    a.rider_id,
    a.rider_name,
    -- joined meta from the canonical riders table when we have a rider_id
    r.pro_team,
    r.bib_number,
    r.pcs_slug,
    a.stage_points,
    a.gc_points,
    a.total_points,
    rank() over (
      partition by a.pool_id
      order by a.total_points desc
    ) as overall_rank
  from agg a
  left join public.riders r on r.id = a.rider_id;

-- v_perfect_team rebuild — was dropped at the top of this migration so the
-- dependency on v_rider_totals could be replaced.
create view public.v_perfect_team as
  select * from public.v_rider_totals where overall_rank <= 15;
