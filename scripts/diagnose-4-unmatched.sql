-- Unmatched picks (riders whose scores don't flow to their team).
select tr.raw_name, tr.match_status, tr.is_reserve, t.player_name
from public.team_riders tr
join public.teams t on t.id = tr.team_id
where t.pool_id = (select id from public.pools where year = 2026)
  and tr.match_status in ('unmatched', 'ambiguous')
order by t.player_name, tr.is_reserve, tr.pick_order;
