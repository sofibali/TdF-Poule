-- ============================================================================
-- Tiered youth bonus (replaces the single-rider youth_bonus_points approach).
--
-- Old rule (migration 0018): one rider per stage got a flat +4.
-- New rule:
--   Normal stages : 1st young finisher +3, 2nd +2, 3rd +1
--   TTT           : every youth-eligible rider on a top-3 team gets +1
--
-- We store the awards explicitly per rider in stage_youth_bonus rather than
-- trying to encode them in stage_jersey_leaders, which has a single-row-per-
-- classification constraint. The scoring view just sums whatever is there.
-- ============================================================================

create table if not exists public.stage_youth_bonus (
  pool_id       uuid not null references public.pools(id) on delete cascade,
  stage         int  not null check (stage between 1 and 25),
  rider_id      uuid not null references public.riders(id) on delete cascade,
  bonus_points  int  not null check (bonus_points > 0),
  primary key (pool_id, stage, rider_id)
);
alter table public.stage_youth_bonus enable row level security;
create policy "public read youth bonus"
  on public.stage_youth_bonus for select using (true);

-- Rebuild v_team_stage_points: replace the old stage_jersey_leaders youth join
-- with a join on stage_youth_bonus (sums per-rider bonus points directly).
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
    on spt.position = coalesce(sr.scoring_position, sr.position)
  left join public.stage_youth_bonus syb
    on syb.pool_id = a.pool_id and syb.stage = a.stage and syb.rider_id = a.rider_id
  group by a.team_id, a.pool_id, a.stage;
