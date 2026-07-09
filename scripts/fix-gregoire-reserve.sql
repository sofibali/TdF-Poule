-- Gregoire was incorrectly entered as a reserve for Karin's and Sofia's teams.
-- He should be a main pick (matching his status in all other teams).
-- Move him from reserve to main, assigning the next available pick_order.

update public.team_riders tr
set
  is_reserve    = false,
  reserve_order = null,
  pick_order    = (
    select coalesce(max(tr2.pick_order), 0) + 1
    from public.team_riders tr2
    where tr2.team_id = tr.team_id and tr2.is_reserve = false
  )
where tr.raw_name ilike '%gregoire%'
  and tr.team_id in (
    select t.id
    from public.teams t
    join public.pools p on p.id = t.pool_id
    where p.year = 2026
      and t.name ilike '%karin%'
    union
    select t.id
    from public.teams t
    join public.pools p on p.id = t.pool_id
    where p.year = 2026
      and t.name ilike '%sofia%'
  );
