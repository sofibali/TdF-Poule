-- ============================================================================
-- Scoring functions and views
--
-- Two derivations the rest of the app reads from:
--
--   v_team_active_riders   for each (team, stage), which rider IDs are active
--                          after applying reserve substitutions
--   v_team_stage_points    points each team scored in each stage + final GC
--   v_leaderboard          totals per team, ranked
--
-- Substitution rule (matches tdf_engine.py):
--   - A pick is "out" for stage S if any of:
--       a) match_status in ('unmatched', 'ambiguous')   — couldn't resolve / Sofia not yet decided
--       b) rider is in rider_dropouts with dropout_after_stage < S
--   - For S <= 6 (RESERVE_LOCK_STAGE), we sub a reserve in reserve_order.
--   - Each reserve can only fill in once across the team.
--   - For S >= 7, no substitution — the slot is just empty (zero points).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Stage point tables. Mirrored from lib/scoring/rules.ts. Kept in SQL so the
-- view is self-contained; if the rules change we update both.
-- ----------------------------------------------------------------------------
create table public.stage_point_table (
  position int primary key,
  points   int not null
);
insert into public.stage_point_table (position, points) values
  (1, 20), (2, 15), (3, 12), (4, 10), (5, 8),
  (6,  6), (7,  5), (8,  4), (9,  3), (10, 2);

create table public.gc_point_table (
  position int primary key,
  points   int not null
);
insert into public.gc_point_table (position, points) values
  (1, 100), (2, 80), (3, 60), (4, 40), (5, 30),
  (6,  25), (7, 20), (8, 18), (9, 16), (10, 15);

alter table public.stage_point_table enable row level security;
alter table public.gc_point_table    enable row level security;
create policy "public read stage_pts" on public.stage_point_table for select using (true);
create policy "public read gc_pts"    on public.gc_point_table    for select using (true);

-- ----------------------------------------------------------------------------
-- team_active_riders(team, stage) — applies reserve substitution
-- ----------------------------------------------------------------------------
create or replace function public.team_active_riders(p_team_id uuid, p_stage int)
returns table (rider_id uuid, source text)
language plpgsql
stable
as $$
declare
  v_pool_id uuid;
begin
  select t.pool_id into v_pool_id from public.teams t where t.id = p_team_id;

  return query
  with main_picks as (
    select tr.id, tr.rider_id, tr.match_status, tr.pick_order
    from public.team_riders tr
    where tr.team_id = p_team_id and tr.is_reserve = false
  ),
  -- A main pick is "out" if it's unmatched/ambiguous OR the rider dropped
  -- before the current stage.
  pick_status as (
    select
      mp.id,
      mp.rider_id,
      mp.pick_order,
      case
        when mp.match_status in ('unmatched', 'ambiguous') then false
        when exists (
          select 1 from public.rider_dropouts d
          where d.pool_id = v_pool_id
            and d.rider_id = mp.rider_id
            and d.dropout_after_stage < p_stage
        ) then false
        else true
      end as is_active
    from main_picks mp
  ),
  -- Reserves available for substitution, in order.
  reserves as (
    select tr.rider_id, tr.reserve_order, tr.match_status
    from public.team_riders tr
    where tr.team_id = p_team_id and tr.is_reserve = true
    order by tr.reserve_order
  ),
  -- Number of slots that need filling.
  slots_needed as (
    select count(*) as n
    from pick_status
    where is_active = false
  ),
  -- Subs are only valid for stages 1..6. Take that many reserves in order
  -- (only those that themselves matched and didn't drop before this stage).
  reserves_usable as (
    select rider_id
    from reserves r
    where p_stage <= 6
      and r.match_status not in ('unmatched', 'ambiguous')
      and not exists (
        select 1 from public.rider_dropouts d
        where d.pool_id = v_pool_id
          and d.rider_id = r.rider_id
          and d.dropout_after_stage < p_stage
      )
    order by r.reserve_order
    limit (select n from slots_needed)
  )
  -- Active main picks
  select ps.rider_id, 'main'::text as source
    from pick_status ps where ps.is_active = true and ps.rider_id is not null
  union all
  -- Plus reserve fillers (only when stage <= 6)
  select ru.rider_id, 'reserve'::text from reserves_usable ru;
end;
$$;

-- ----------------------------------------------------------------------------
-- v_team_active_riders_all — convenience: cartesian over all stages 1..21 + GC
-- (keeps the view materialisable; we'll skip mat-view for now since updates
-- are cheap.)
-- ----------------------------------------------------------------------------
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
    coalesce(sum(spt.points), 0) as points
  from active a
  left join public.stage_results sr
    on sr.pool_id = a.pool_id
   and sr.stage   = a.stage
   and sr.rider_id = a.rider_id
  left join public.stage_point_table spt on spt.position = sr.position
  group by a.team_id, a.pool_id, a.stage;

-- ----------------------------------------------------------------------------
-- v_team_gc_points — GC scoring uses ALL roster riders (main + reserves);
-- per the original engine, the final classification rewards anyone you picked.
-- ----------------------------------------------------------------------------
create or replace view public.v_team_gc_points as
  select
    t.id as team_id,
    t.pool_id,
    coalesce(sum(gpt.points), 0) as points
  from public.teams t
  left join public.team_riders tr on tr.team_id = t.id
  left join public.final_gc fg
    on fg.pool_id = t.pool_id
   and fg.rider_id = tr.rider_id
  left join public.gc_point_table gpt on gpt.position = fg.position
  group by t.id, t.pool_id;

-- ----------------------------------------------------------------------------
-- v_leaderboard — what the public homepage queries, ordered by total desc.
-- ----------------------------------------------------------------------------
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
  left join stage_totals       st on st.team_id = t.id
  left join public.v_team_gc_points g on g.team_id = t.id;

-- ----------------------------------------------------------------------------
-- v_unresolved_picks — drives the /admin/upload "needs your attention" panel.
-- Lists every team_rider with match_status in ('ambiguous', 'unmatched'),
-- including the candidate riders to choose from.
-- ----------------------------------------------------------------------------
create or replace view public.v_unresolved_picks as
  select
    tr.id            as team_rider_id,
    tr.team_id,
    t.pool_id,
    p.year,
    t.name           as team_name,
    tr.raw_name,
    tr.is_reserve,
    tr.reserve_order,
    tr.match_status,
    tr.match_candidates,
    tr.admin_note
  from public.team_riders tr
  join public.teams t on t.id = tr.team_id
  join public.pools p on p.id = t.pool_id
  where tr.match_status in ('ambiguous', 'unmatched')
  order by p.year desc, t.name, tr.is_reserve, tr.reserve_order, tr.pick_order;
