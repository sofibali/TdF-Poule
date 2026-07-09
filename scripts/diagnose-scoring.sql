-- Diagnostic: check stage_youth_bonus and scoring state for 2026.
-- Run in Supabase SQL editor.

-- 1) Which stages have been completed (have stage_results)?
select stage, count(*) as riders
from public.stage_results
where pool_id = (select id from public.pools where year = 2026)
group by stage
order by stage;

-- 2) What's in stage_youth_bonus for 2026?
select syb.stage, r.full_name, r.bib_number, syb.bonus_points
from public.stage_youth_bonus syb
join public.riders r on r.id = syb.rider_id
where syb.pool_id = (select id from public.pools where year = 2026)
order by syb.stage, syb.bonus_points desc;

-- 3) Which stages have jersey leaders stored (incremental gate)?
select stage, classification, raw_name
from public.stage_jersey_leaders
where pool_id = (select id from public.pools where year = 2026)
order by stage, classification;

-- 4) Team leaderboard with points breakdown.
select name, player_name, total_points, stage_points, gc_points, rank
from public.v_leaderboard
where pool_id = (select id from public.pools where year = 2026)
order by rank;

-- 5) Check unmatched team_riders (score blockers).
select tr.raw_name, tr.match_status, tr.is_reserve, t.player_name
from public.team_riders tr
join public.teams t on t.id = tr.team_id
where t.pool_id = (select id from public.pools where year = 2026)
  and tr.match_status in ('unmatched', 'ambiguous')
order by t.player_name, tr.is_reserve, tr.pick_order;

-- 6) DNS / dropout riders.
select r.full_name, r.bib_number, rd.dropout_after_stage
from public.rider_dropouts rd
join public.riders r on r.id = rd.rider_id
where rd.pool_id = (select id from public.pools where year = 2026)
order by rd.dropout_after_stage, r.full_name;
