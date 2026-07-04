-- ============================================================================
-- Make v_rider_totals start from the riders table so all seeded riders
-- appear on the Riders tab even before any results (e.g. 2026 start list).
--
-- Before: view was built from stage_results ∪ final_gc → only riders with
-- points ever appeared.
-- After:  view starts from riders (LEFT JOIN points), so all 184 2026 starters
-- show at 0/0/0 pre-race, then fill in naturally as results land.
--
-- Backward compatible: historical years only have result-seeded riders in the
-- riders table, so they show the same set as before. An extra UNION covers any
-- legacy unmatched result rows (rider_id IS NULL) with points — preserves the
-- handful of historical edge-case entries.
-- ============================================================================

drop view if exists public.v_perfect_team;
drop view if exists public.v_rider_totals;

create view public.v_rider_totals as
  with stage_pts as (
    select pool_id, rider_id, sum(points) as stage_points
    from   public.v_rider_stage_points
    where  rider_id is not null
    group  by pool_id, rider_id
  ),
  gc_pts as (
    select fg.pool_id, fg.rider_id, sum(coalesce(gpt.points, 0)) as gc_points
    from   public.final_gc fg
    join   public.gc_point_table gpt on gpt.position = fg.position
    where  fg.rider_id is not null
    group  by fg.pool_id, fg.rider_id
  ),
  -- Legacy safety net: unmatched result rows (rider_id IS NULL) that have pts.
  -- Only non-zero to avoid polluting pre-race views with 0-point null rows.
  unmatched_stage as (
    select pool_id,
           lower(rider_name)   as rider_key,
           null::uuid          as rider_id,
           max(rider_name)     as rider_name,
           sum(points)         as stage_points
    from   public.v_rider_stage_points
    where  rider_id is null
    group  by pool_id, lower(rider_name)
    having sum(points) > 0
  ),
  unmatched_gc as (
    select fg.pool_id,
           lower(fg.raw_name)           as rider_key,
           null::uuid                   as rider_id,
           max(fg.raw_name)             as rider_name,
           sum(coalesce(gpt.points, 0)) as gc_points
    from   public.final_gc fg
    join   public.gc_point_table gpt on gpt.position = fg.position
    where  fg.rider_id is null
    group  by fg.pool_id, lower(fg.raw_name)
    having sum(coalesce(gpt.points, 0)) > 0
  ),
  -- All seeded riders (start-list or result-seeded), including 0-point ones.
  matched as (
    select
      r.pool_id,
      r.id::text                              as rider_key,
      r.id                                    as rider_id,
      r.full_name                             as rider_name,
      r.pro_team,
      r.bib_number,
      r.pcs_slug,
      coalesce(s.stage_points, 0)             as stage_points,
      coalesce(g.gc_points,    0)             as gc_points,
      coalesce(s.stage_points, 0)
        + coalesce(g.gc_points, 0)            as total_points
    from   public.riders r
    left join stage_pts s on s.pool_id = r.pool_id and s.rider_id = r.id
    left join gc_pts    g on g.pool_id = r.pool_id and g.rider_id = r.id
  ),
  -- Unmatched: merge stage + gc for same raw_name; gc-only rows kept separately.
  unmatched as (
    select
      us.pool_id,
      us.rider_key,
      null::uuid  as rider_id,
      us.rider_name,
      null::text  as pro_team,
      null::int   as bib_number,
      null::text  as pcs_slug,
      us.stage_points,
      coalesce(ug.gc_points, 0)               as gc_points,
      us.stage_points + coalesce(ug.gc_points, 0) as total_points
    from   unmatched_stage us
    left join unmatched_gc ug
           on ug.pool_id   = us.pool_id
          and ug.rider_key = us.rider_key

    union all

    -- gc-only unmatched (no stage points at all)
    select
      ug.pool_id,
      ug.rider_key,
      null::uuid, ug.rider_name,
      null::text, null::int, null::text,
      0::bigint, ug.gc_points, ug.gc_points
    from   unmatched_gc ug
    left join unmatched_stage us
           on us.pool_id   = ug.pool_id
          and us.rider_key = ug.rider_key
    where  us.rider_key is null
  )
  select
    pool_id, rider_key, rider_id, rider_name,
    pro_team, bib_number, pcs_slug,
    stage_points, gc_points, total_points,
    rank() over (
      partition by pool_id
      order by total_points desc
    ) as overall_rank
  from matched

  union all

  select
    pool_id, rider_key, rider_id, rider_name,
    pro_team, bib_number, pcs_slug,
    stage_points, gc_points, total_points,
    rank() over (
      partition by pool_id
      order by total_points desc
    ) as overall_rank
  from unmatched;

create view public.v_perfect_team as
  select * from public.v_rider_totals where overall_rank <= 15;
