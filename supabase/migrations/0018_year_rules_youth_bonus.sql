-- ============================================================================
-- Per-year rule knobs + the 2026 white-jersey bonus.
--
-- Rules drift year to year. Two new per-pool settings (defaults keep every
-- existing year unchanged):
--   reserve_lock_stage  — last stage a reserve may sub in (was a hard 6; 2026 = 10)
--   youth_bonus_points  — points the white-jersey holder earns each stage
--                         (0 everywhere historically; 2026 = 4)
--
-- The youth bonus needs to know who wore white after each stage, so we add
-- stage_jersey_leaders (filled by the live scraper from letour's youth
-- classification; it also stores the other jerseys as a backup).
-- ============================================================================

alter table public.pools
  add column if not exists reserve_lock_stage int not null default 6;
alter table public.pools
  add column if not exists youth_bonus_points int not null default 0;

-- The 2026 edition's rules (no-op until the 2026 pool exists).
update public.pools
   set reserve_lock_stage = 10, youth_bonus_points = 4
 where year >= 2026;

create table if not exists public.stage_jersey_leaders (
  pool_id        uuid not null references public.pools(id) on delete cascade,
  stage          int  not null,
  classification text not null,            -- 'gc' | 'points' | 'mountain' | 'youth'
  rider_id       uuid references public.riders(id) on delete set null,
  raw_name       text,
  primary key (pool_id, stage, classification)
);
alter table public.stage_jersey_leaders enable row level security;
create policy "public read jersey leaders"
  on public.stage_jersey_leaders for select using (true);

-- ----------------------------------------------------------------------------
-- team_active_riders — same as 0017 but the substitution window is the pool's
-- reserve_lock_stage instead of a hard-coded 6.
-- ----------------------------------------------------------------------------
create or replace function public.team_active_riders(p_team_id uuid, p_stage int)
returns table (rider_id uuid, source text)
language plpgsql
stable
as $$
declare
  v_pool_id uuid;
  v_lock    int;
begin
  select t.pool_id into v_pool_id from public.teams t where t.id = p_team_id;
  select coalesce(p.reserve_lock_stage, 6) into v_lock
    from public.pools p where p.id = v_pool_id;

  return query
  with main_status as (
    select
      tr.rider_id,
      tr.pick_order,
      case
        when tr.match_status in ('unmatched', 'ambiguous') then 0
        else coalesce(
          (select d.dropout_after_stage from public.rider_dropouts d
             where d.pool_id = v_pool_id and d.rider_id = tr.rider_id),
          99)
      end as out_after
    from public.team_riders tr
    where tr.team_id = p_team_id and tr.is_reserve = false
  ),
  vacancies as (
    select out_after,
           row_number() over (order by out_after, pick_order) as vrank
    from main_status
    where out_after < v_lock
  ),
  reserve_status as (
    select rs.rider_id, rs.out_after,
           row_number() over (order by rs.reserve_order) as rrank
    from (
      select
        tr.rider_id,
        tr.reserve_order,
        coalesce(
          (select d.dropout_after_stage from public.rider_dropouts d
             where d.pool_id = v_pool_id and d.rider_id = tr.rider_id),
          99) as out_after
      from public.team_riders tr
      where tr.team_id = p_team_id and tr.is_reserve = true
        and tr.match_status not in ('unmatched', 'ambiguous')
        and tr.rider_id is not null
    ) rs
    where rs.out_after >= v_lock
  ),
  subs as (
    select r.rider_id, v.out_after as join_after, r.out_after as res_out
    from vacancies v
    join reserve_status r on r.rrank = v.vrank
  )
  select ms.rider_id, 'main'::text
    from main_status ms
   where ms.rider_id is not null and ms.out_after >= p_stage
  union all
  select s.rider_id, 'reserve'::text
    from subs s
   where p_stage > s.join_after and s.res_out >= p_stage;
end;
$$;

-- ----------------------------------------------------------------------------
-- v_team_stage_points — stage placing points PLUS the youth bonus: when a
-- team's active rider for a stage is that stage's white-jersey holder, add the
-- pool's youth_bonus_points (0 for every year except 2026).
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
    coalesce(sum(spt.points), 0)
      + coalesce(sum(case when jl.rider_id is not null
                          then p.youth_bonus_points else 0 end), 0) as points
  from active a
  join public.pools p on p.id = a.pool_id
  left join public.stage_results sr
    on sr.pool_id = a.pool_id and sr.stage = a.stage and sr.rider_id = a.rider_id
  left join public.stage_point_table spt on spt.position = sr.position
  left join public.stage_jersey_leaders jl
    on jl.pool_id = a.pool_id and jl.stage = a.stage
   and jl.classification = 'youth' and jl.rider_id = a.rider_id
  group by a.team_id, a.pool_id, a.stage;
