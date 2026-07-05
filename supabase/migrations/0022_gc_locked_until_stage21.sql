-- ============================================================================
-- GC points: show mid-race but only count in totals after all 21 stages.
--
-- gc_points column stays as-is (always shows the current GC value so
-- players can see who is leading). total_points and rank() only include
-- gc_points once stage 21 exists in stage_results for that pool.
--
-- Affects v_leaderboard (team scores) and v_rider_totals (rider scores).
-- Historical years already have stage 21 so their totals are unchanged.
-- ============================================================================

-- Helper: pools that have stage-21 results (race fully complete).
-- Used as an inline EXISTS check in both views below.

-- ── v_leaderboard ────────────────────────────────────────────────────────────
create or replace view public.v_leaderboard as
  with stage_totals as (
    select team_id, pool_id, sum(points) as stage_points
    from public.v_team_stage_points
    group by team_id, pool_id
  ),
  gc_locked as (
    -- pool_ids where stage 21 results exist → GC counts
    select distinct pool_id from public.stage_results where stage = 21
  )
  select
    t.id          as team_id,
    t.pool_id,
    p.year,
    t.name,
    t.player_name,
    -- total first (matches existing column order from 0009)
    coalesce(st.stage_points, 0)
      + case when gl.pool_id is not null
             then coalesce(g.points, 0) else 0 end as total_points,
    coalesce(st.stage_points, 0) as stage_points,
    -- gc_points: always shown (informational mid-race)
    coalesce(g.points, 0) as gc_points,
    rank() over (
      partition by t.pool_id
      order by
        coalesce(st.stage_points, 0)
          + case when gl.pool_id is not null
                 then coalesce(g.points, 0) else 0 end desc
    ) as rank
  from public.teams t
  join public.pools p on p.id = t.pool_id
  left join stage_totals st on st.team_id = t.id and st.pool_id = t.pool_id
  left join public.v_team_gc_points g on g.team_id = t.id and g.pool_id = t.pool_id
  left join gc_locked gl on gl.pool_id = t.pool_id;

-- ── v_rider_totals ────────────────────────────────────────────────────────────
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
  gc_locked as (
    select distinct pool_id from public.stage_results where stage = 21
  ),
  unmatched_stage as (
    select pool_id, lower(rider_name) as rider_key, null::uuid as rider_id,
           max(rider_name) as rider_name, sum(points) as stage_points
    from   public.v_rider_stage_points
    where  rider_id is null
    group  by pool_id, lower(rider_name)
    having sum(points) > 0
  ),
  unmatched_gc as (
    select fg.pool_id, lower(fg.raw_name) as rider_key, null::uuid as rider_id,
           max(fg.raw_name) as rider_name,
           sum(coalesce(gpt.points, 0)) as gc_points
    from   public.final_gc fg
    join   public.gc_point_table gpt on gpt.position = fg.position
    where  fg.rider_id is null
    group  by fg.pool_id, lower(fg.raw_name)
    having sum(coalesce(gpt.points, 0)) > 0
  ),
  matched as (
    select
      r.pool_id,
      r.id::text                                as rider_key,
      r.id                                      as rider_id,
      r.full_name                               as rider_name,
      r.pro_team,
      r.bib_number,
      r.pcs_slug,
      coalesce(s.stage_points, 0)               as stage_points,
      coalesce(g.gc_points, 0)                  as gc_points,
      -- total: GC only after stage 21
      coalesce(s.stage_points, 0)
        + case when gl.pool_id is not null
               then coalesce(g.gc_points, 0) else 0 end as total_points
    from   public.riders r
    left join stage_pts  s  on s.pool_id  = r.pool_id and s.rider_id  = r.id
    left join gc_pts     g  on g.pool_id  = r.pool_id and g.rider_id  = r.id
    left join gc_locked  gl on gl.pool_id = r.pool_id
  ),
  unmatched as (
    select
      us.pool_id, us.rider_key, null::uuid as rider_id, us.rider_name,
      null::text as pro_team, null::int as bib_number, null::text as pcs_slug,
      us.stage_points,
      coalesce(ug.gc_points, 0) as gc_points,
      us.stage_points
        + case when gl.pool_id is not null
               then coalesce(ug.gc_points, 0) else 0 end as total_points
    from   unmatched_stage us
    left join unmatched_gc ug on ug.pool_id = us.pool_id and ug.rider_key = us.rider_key
    left join gc_locked    gl on gl.pool_id = us.pool_id

    union all

    select
      ug.pool_id, ug.rider_key, null::uuid, ug.rider_name,
      null::text, null::int, null::text,
      0::bigint, ug.gc_points,
      case when gl.pool_id is not null then ug.gc_points else 0 end
    from   unmatched_gc ug
    left join unmatched_stage us on us.pool_id = ug.pool_id and us.rider_key = ug.rider_key
    left join gc_locked        gl on gl.pool_id = ug.pool_id
    where  us.rider_key is null
  )
  select
    pool_id, rider_key, rider_id, rider_name,
    pro_team, bib_number, pcs_slug,
    stage_points, gc_points, total_points,
    rank() over (partition by pool_id order by total_points desc) as overall_rank
  from matched

  union all

  select
    pool_id, rider_key, rider_id, rider_name,
    pro_team, bib_number, pcs_slug,
    stage_points, gc_points, total_points,
    rank() over (partition by pool_id order by total_points desc) as overall_rank
  from unmatched;

create view public.v_perfect_team as
  select * from public.v_rider_totals where overall_rank <= 15;
