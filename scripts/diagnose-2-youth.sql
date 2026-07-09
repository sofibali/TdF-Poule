-- Youth bonus entries per stage (should have 3 rows per stage with 4/3/2 pts).
select syb.stage, r.full_name, r.bib_number, syb.bonus_points
from public.stage_youth_bonus syb
join public.riders r on r.id = syb.rider_id
where syb.pool_id = (select id from public.pools where year = 2026)
order by syb.stage, syb.bonus_points desc;
