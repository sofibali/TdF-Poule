-- ============================================================================
-- v_rider_season_points — every rider's points for a year, computed straight
-- from results and INDEPENDENT of any team. This is the "score all riders
-- properly first" half: stage points (top-10 placings) + final-GC points.
-- Team scores are then just sums over each team's picked riders, so a bad pick
-- match can never corrupt the rider truth, and vice versa.
--
-- Inspect with:  select * from v_rider_season_points where year = 2024
--                order by total_points desc limit 20;
-- ============================================================================

create or replace view public.v_rider_season_points as
  with stage_pts as (
    select sr.pool_id, sr.rider_id, coalesce(sum(spt.points), 0) as pts
    from public.stage_results sr
    join public.stage_point_table spt on spt.position = sr.position
    where sr.rider_id is not null
    group by sr.pool_id, sr.rider_id
  ),
  gc_pts as (
    select fg.pool_id, fg.rider_id, coalesce(sum(gpt.points), 0) as pts
    from public.final_gc fg
    join public.gc_point_table gpt on gpt.position = fg.position
    where fg.rider_id is not null
    group by fg.pool_id, fg.rider_id
  )
  select
    r.pool_id,
    p.year,
    r.id   as rider_id,
    r.full_name,
    coalesce(s.pts, 0)                      as stage_points,
    coalesce(g.pts, 0)                      as gc_points,
    coalesce(s.pts, 0) + coalesce(g.pts, 0) as total_points
  from public.riders r
  join public.pools p on p.id = r.pool_id
  left join stage_pts s on s.pool_id = r.pool_id and s.rider_id = r.id
  left join gc_pts    g on g.pool_id = r.pool_id and g.rider_id = r.id;
