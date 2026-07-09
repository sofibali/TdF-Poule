-- Check Gregoire's pick status across all 2026 teams
select
  t.name          as team_name,
  tr.raw_name,
  tr.is_reserve,
  tr.reserve_order,
  tr.pick_order,
  tr.match_status
from public.team_riders tr
join public.teams t on t.id = tr.team_id
join public.pools p on p.id = t.pool_id
where p.year = 2026
  and tr.raw_name ilike '%gregoire%'
order by t.name;
