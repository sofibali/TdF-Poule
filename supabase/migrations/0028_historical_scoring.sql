-- ============================================================================
-- Historical scoring mode for team_active_riders.
--
-- Pools that pre-date live withdrawal tracking have no rider_dropouts records.
-- For those pools every matched pick — main and reserve alike — should score
-- across all stages of the Tour, with no reserve-substitution logic applied.
--
-- Detection: if a pool has zero rider_dropouts rows we switch to historical
-- mode and return all matched team_riders unconditionally.  Only the live
-- (current-year) pool accumulates dropout records via the scraper, so this
-- correctly identifies every older edition.
-- ============================================================================

create or replace function public.team_active_riders(p_team_id uuid, p_stage int)
returns table (rider_id uuid, source text)
language plpgsql
stable
as $$
declare
  v_pool_id uuid;
  v_has_dropouts bool;
begin
  select t.pool_id into v_pool_id from public.teams t where t.id = p_team_id;

  -- Historical mode: pool has no dropout records → all matched riders score.
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

  -- Live mode: apply reserve-substitution logic.
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
    where out_after < 6
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
    where rs.out_after >= 6
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
