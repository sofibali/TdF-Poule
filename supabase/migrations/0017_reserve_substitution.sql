-- ============================================================================
-- Reserve substitution, corrected to the house rule.
--
-- Rule (confirmed): a reserve replaces a main rider who did NOT finish stage 6.
-- The reserve then scores from (the main's dropout stage + 1) through stage 21,
-- fully taking the rider's place — including final-GC points. Reserves are used
-- in reserve_order to fill vacancies ordered by when they opened.
--
-- The previous logic only credited reserves for stages 1–6 and never gave them
-- GC points, which under-counted any team whose pick crashed out early (e.g.
-- 2023: Enric Mas DNS stage 1 → his reserve should ride the rest of the Tour).
-- ============================================================================

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
  with main_status as (
    -- out_after = last stage this main was active. 0 = never started
    -- (unmatched / DNS), 99 = finished the Tour, else the dropout stage.
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
  -- Replaceable mains = those who did not finish stage 6 (out_after < 6).
  -- Ordered by when they dropped, then pick order → vacancy fill order.
  vacancies as (
    select out_after,
           row_number() over (order by out_after, pick_order) as vrank
    from main_status
    where out_after < 6
  ),
  -- Usable reserves: in reserve_order, but ONLY those who themselves finished
  -- stage 6 (out_after >= 6) — a reserve who also crashed out early can't take
  -- anyone's place, so you skip to the next reserve. Each carries its own later
  -- drop stage so it stops scoring if it abandons after subbing in.
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
  -- Pair each vacancy with a reserve (1↔1, in order). The reserve takes over
  -- from the stage after the main dropped (join_after).
  subs as (
    select r.rider_id, v.out_after as join_after, r.out_after as res_out
    from vacancies v
    join reserve_status r on r.rrank = v.vrank
  )
  -- Mains still riding at this stage.
  select ms.rider_id, 'main'::text
    from main_status ms
   where ms.rider_id is not null and ms.out_after >= p_stage
  union all
  -- Subbed-in reserves: active from join_after+1 to the end, while they ride.
  select s.rider_id, 'reserve'::text
    from subs s
   where p_stage > s.join_after and s.res_out >= p_stage;
end;
$$;

-- ----------------------------------------------------------------------------
-- v_team_gc_points — GC points for the FINAL roster: mains who finished plus
-- any subbed-in reserves (the team as it stood at stage 21). Unused bench
-- reserves and dropped-out riders contribute nothing.
-- ----------------------------------------------------------------------------
create or replace view public.v_team_gc_points as
  select
    t.id as team_id,
    t.pool_id,
    coalesce(sum(gpt.points), 0) as points
  from public.teams t
  cross join lateral public.team_active_riders(t.id, 21) ar
  left join public.final_gc fg
    on fg.pool_id = t.pool_id and fg.rider_id = ar.rider_id
  left join public.gc_point_table gpt on gpt.position = fg.position
  group by t.id, t.pool_id;
