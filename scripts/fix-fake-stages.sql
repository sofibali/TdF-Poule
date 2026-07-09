-- Step 1: See which stages exist and who "won" each (position 1 rider).
-- Compare consecutive stages — repeated winner = GC bleed-through.
select
  stage,
  count(*)          as rider_count,
  max(case when position = 1 then raw_name end) as stage_winner
from public.stage_results
where pool_id = (select id from public.pools where year = 2026)
group by stage
order by stage;

-- ─────────────────────────────────────────────────────────────────
-- Step 2 (run separately AFTER reviewing step 1):
-- Delete stages where the winner matches the previous stage winner
-- (those are GC bleed-through rows, not real stage results).
-- Replace 7 below with the actual last real stage number.
--
-- delete from public.stage_results
-- where pool_id = (select id from public.pools where year = 2026)
--   and stage > 7;   -- ← set to last real completed stage
