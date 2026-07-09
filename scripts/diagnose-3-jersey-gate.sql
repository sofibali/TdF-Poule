-- Jersey stages already fetched (incremental gate — these won't be re-fetched on refresh).
select stage, classification, raw_name
from public.stage_jersey_leaders
where pool_id = (select id from public.pools where year = 2026)
order by stage, classification;
