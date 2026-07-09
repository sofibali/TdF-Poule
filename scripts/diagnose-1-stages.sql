-- Which stages are complete and stored?
select stage, count(*) as riders
from public.stage_results
where pool_id = (select id from public.pools where year = 2026)
group by stage
order by stage;
