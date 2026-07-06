-- Wipe all 2026 stage/GC data so a fresh admin refresh rebuilds everything.
-- Keeps: pools, riders, teams, team_riders, rider_dropouts (Meeus/Roglic DNS).

delete from public.stage_results
where pool_id = (select id from public.pools where year = 2026);

delete from public.final_gc
where pool_id = (select id from public.pools where year = 2026);

delete from public.stage_youth_bonus
where pool_id = (select id from public.pools where year = 2026);

delete from public.stage_jersey_leaders
where pool_id = (select id from public.pools where year = 2026);
