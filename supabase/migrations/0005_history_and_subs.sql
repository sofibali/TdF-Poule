-- ============================================================================
-- v_historical_winners — one row per past pool, the rank-1 team.
-- v_team_pick_events  — per (team, pick) status: active / dropped / unmatched
--                       for main picks; unused / joined-at-stage-N for reserves.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- v_historical_winners
-- ----------------------------------------------------------------------------
create or replace view public.v_historical_winners as
  select
    p.year,
    lb.team_id,
    lb.name        as team_name,
    lb.player_name,
    lb.total_points
  from public.v_leaderboard lb
  join public.pools p on p.id = lb.pool_id
  where lb.rank = 1;

-- ----------------------------------------------------------------------------
-- v_team_pick_events
--
-- For every team_riders row, derives the per-stage status the UI shows:
--
--   Main picks:
--     status      = 'active'      → finished the Tour
--                 = 'dropped_out'  → in rider_dropouts
--                 = 'didnt_start'  → match_status in (unmatched, ambiguous)
--     dropout_after_stage          → set when 'dropped_out'
--
--   Reserves (resolved by simulating stages 1..6 in order):
--     status      = 'used'         → filled a vacant slot
--                 = 'unused'       → never needed (or stage-lock passed)
--     joined_at_stage              → set when 'used'
--     replaced_team_rider_id       → which main pick they took over for
-- ----------------------------------------------------------------------------
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
declare
  v_pool_id uuid;
  v_lock    int := 6;  -- RESERVE_LOCK_STAGE
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
        when tr.match_status in ('unmatched', 'ambiguous') then 0  -- never started
        else coalesce(
          (select d.dropout_after_stage
             from public.rider_dropouts d
             where d.pool_id = v_pool_id and d.rider_id = tr.rider_id),
          99  -- effectively never dropped
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
  -- A vacant slot exists for stage S when the main pick's last_active_stage < S
  -- AND S <= v_lock. The reserve queue fills slots in (stage asc, pick_order asc).
  --
  -- Build the list of (stage, replacing_team_rider_id) vacancies from S=1..lock.
  vacancies as (
    select s.stage, mp.team_rider_id, mp.raw_name as replaced_raw_name, mp.pick_order
    from generate_series(1, v_lock) as s(stage)
    join main_picks mp on mp.last_active_stage < s.stage
    -- One vacancy per (main pick) the FIRST stage they're vacant — we don't
    -- want to keep filling the same slot every stage.
    where s.stage = greatest(1, mp.last_active_stage + 1)
    order by s.stage, mp.pick_order
  ),
  -- Number the vacancies in fill order so we can pair with reserves.
  vacancies_numbered as (
    select v.*, row_number() over (order by stage, pick_order) as fill_idx
    from vacancies v
  ),
  reserves_numbered as (
    select r.*, row_number() over (order by reserve_order) as fill_idx
    from reserves r
    where match_status not in ('unmatched', 'ambiguous')
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
  -- Output: main picks first, then reserves
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
