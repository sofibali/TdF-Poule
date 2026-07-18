-- ============================================================================
-- Fix: migration 0028 accidentally reverted the v_lock variable that 0018
-- introduced. It hard-coded the vacancy/reserve thresholds back to 6 instead
-- of reading reserve_lock_stage from the pools table, which meant any rider
-- who dropped on stage 6 (e.g. Uijtdebroeks) never opened a reserve slot.
--
-- This restore the correct logic: read v_lock from pools.reserve_lock_stage
-- (default 6 for historical years, 10 for 2026+), then use it for both:
--   • vacancies: mains who left before stage v_lock
--   • reserve eligibility: reserves who are still riding at stage v_lock
-- ============================================================================

create or replace function public.team_active_riders(p_team_id uuid, p_stage int)
returns table (rider_id uuid, source text)
language plpgsql
stable
as $$
declare
  v_pool_id uuid;
  v_has_dropouts bool;
  v_lock int;
begin
  select t.pool_id into v_pool_id from public.teams t where t.id = p_team_id;

  -- Historical mode: pool has no dropout records → all matched riders score,
  -- no reserve-substitution logic needed.
  select exists(
    select 1 from public.rider_dropouts d where d.pool_id = v_pool_id
  ) into v_has_dropouts;

  if not v_has_dropouts then
    return query
    select tr.rider_id,
           case when tr.is_reserve then 'reserve' else 'main' end::text
    from public.team_riders tr
    where tr.team_id = p_team_id
      and tr.match_status not in ('unmatched', 'ambiguous')
      and tr.rider_id is not null;
    return;
  end if;

  -- Live mode: read the pool's reserve substitution window.
  select coalesce(p.reserve_lock_stage, 6) into v_lock
    from public.pools p where p.id = v_pool_id;

  return query
  with main_status as (
    -- out_after = last stage this main was active.
    -- 0 = unmatched/DNS before the Tour, 99 = finished, else the dropout stage.
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
  -- Vacancies: mains who dropped before the reserve lock stage.
  -- Ordered by when they dropped so R1 fills the earliest vacancy, R2 the next, etc.
  vacancies as (
    select out_after,
           row_number() over (order by out_after, pick_order) as vrank
    from main_status
    where out_after < v_lock
  ),
  -- Eligible reserves: those who themselves haven't dropped before the lock stage.
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
  -- Pair each vacancy with a reserve (1↔1 in order of dropout / reserve_order).
  subs as (
    select r.rider_id, v.out_after as join_after, r.out_after as res_out
    from vacancies v
    join reserve_status r on r.rrank = v.vrank
  )
  -- Active mains at this stage.
  select ms.rider_id, 'main'::text
    from main_status ms
   where ms.rider_id is not null and ms.out_after >= p_stage
  union all
  -- Subbed-in reserves: active from (join_after + 1) onward while they ride.
  select s.rider_id, 'reserve'::text
    from subs s
   where p_stage > s.join_after and s.res_out >= p_stage;
end;
$$;
