-- ============================================================================
-- Fix PL/pgSQL ambiguity in team_active_riders + team_pick_events.
--
-- Both functions declare OUT columns named `rider_id` (and others) that
-- collide with table column references inside the function body. The
-- `#variable_conflict use_column` directive tells Postgres to resolve
-- ambiguous identifiers as column references, which is what we want
-- everywhere in these functions.
-- ============================================================================

create or replace function public.team_active_riders(p_team_id uuid, p_stage int)
returns table (rider_id uuid, source text)
language plpgsql
stable
as $$
#variable_conflict use_column
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
  reserves as (
    select tr.rider_id, tr.reserve_order, tr.match_status
    from public.team_riders tr
    where tr.team_id = p_team_id and tr.is_reserve = true
    order by tr.reserve_order
  ),
  slots_needed as (
    select count(*) as n
    from pick_status
    where is_active = false
  ),
  reserves_usable as (
    select r.rider_id
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
  select ps.rider_id, 'main'::text as source
    from pick_status ps where ps.is_active = true and ps.rider_id is not null
  union all
  select ru.rider_id, 'reserve'::text from reserves_usable ru;
end;
$$;


create or replace function public.team_pick_events(p_team_id uuid)
returns table (
  team_rider_id           uuid,
  is_reserve              boolean,
  pick_order              int,
  reserve_order           int,
  raw_name                text,
  rider_id                uuid,
  match_status            public.match_status,
  status                  text,
  dropout_after_stage     int,
  joined_at_stage         int,
  replaced_team_rider_id  uuid,
  replaced_raw_name       text
)
language plpgsql
stable
as $$
#variable_conflict use_column
declare
  v_pool_id uuid;
  v_lock    int := 6;
begin
  select t.pool_id into v_pool_id from public.teams t where t.id = p_team_id;

  return query
  with main_picks as (
    select
      tr.id           as team_rider_id,
      tr.pick_order,
      tr.raw_name,
      tr.rider_id,
      tr.match_status,
      case
        when tr.match_status in ('unmatched', 'ambiguous') then 0
        else coalesce(
          (select d.dropout_after_stage
             from public.rider_dropouts d
             where d.pool_id = v_pool_id and d.rider_id = tr.rider_id),
          99
        )
      end as last_active_stage
    from public.team_riders tr
    where tr.team_id = p_team_id and tr.is_reserve = false
  ),
  reserves as (
    select
      tr.id     as team_rider_id,
      tr.reserve_order,
      tr.raw_name,
      tr.rider_id,
      tr.match_status
    from public.team_riders tr
    where tr.team_id = p_team_id and tr.is_reserve = true
    order by tr.reserve_order
  ),
  vacancies as (
    select s.stage, mp.team_rider_id, mp.raw_name as replaced_raw_name, mp.pick_order
    from generate_series(1, v_lock) as s(stage)
    join main_picks mp on mp.last_active_stage < s.stage
    where s.stage = greatest(1, mp.last_active_stage + 1)
    order by s.stage, mp.pick_order
  ),
  vacancies_numbered as (
    select v.*, row_number() over (order by stage, pick_order) as fill_idx
    from vacancies v
  ),
  reserves_numbered as (
    select r.*, row_number() over (order by reserve_order) as fill_idx
    from reserves r
    where r.match_status not in ('unmatched', 'ambiguous')
  ),
  reserve_assignments as (
    select
      r.team_rider_id           as reserve_team_rider_id,
      v.team_rider_id           as replaced_team_rider_id,
      v.replaced_raw_name,
      v.stage                    as joined_at_stage
    from reserves_numbered r
    join vacancies_numbered v on v.fill_idx = r.fill_idx
  )
  select
    mp.team_rider_id,
    false as is_reserve,
    mp.pick_order,
    null::int as reserve_order,
    mp.raw_name,
    mp.rider_id,
    mp.match_status,
    case
      when mp.match_status in ('unmatched', 'ambiguous') then 'didnt_start'
      when mp.last_active_stage < 99 then 'dropped_out'
      else 'active'
    end as status,
    case
      when mp.last_active_stage between 1 and 90 then mp.last_active_stage
      else null
    end as dropout_after_stage,
    null::int as joined_at_stage,
    null::uuid as replaced_team_rider_id,
    null::text as replaced_raw_name
  from main_picks mp
  union all
  select
    r.team_rider_id,
    true as is_reserve,
    null::int as pick_order,
    r.reserve_order,
    r.raw_name,
    r.rider_id,
    r.match_status,
    case
      when r.match_status in ('unmatched', 'ambiguous') then 'didnt_start'
      when ra.reserve_team_rider_id is not null then 'used'
      else 'unused'
    end as status,
    null::int as dropout_after_stage,
    ra.joined_at_stage,
    ra.replaced_team_rider_id,
    ra.replaced_raw_name
  from reserves r
  left join reserve_assignments ra on ra.reserve_team_rider_id = r.team_rider_id;
end;
$$;
