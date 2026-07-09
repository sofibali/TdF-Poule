-- Current team totals from the scoring view, ordered by total points.
select
  rank() over (order by sum(vsp.points) desc) as rank,
  t.name                                       as team,
  t.player_name,
  sum(vsp.points)                              as total
from public.v_team_stage_points vsp
join public.teams t on t.id = vsp.team_id
join public.pools p on p.id = t.pool_id
where p.year = 2026
group by t.id, t.name, t.player_name
order by total desc;
