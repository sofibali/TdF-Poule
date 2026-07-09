-- Check if the gc_locked logic is present in the v_leaderboard view.
-- If the view definition contains 'gc_locked' the migration was applied.
-- If it just has a simple SUM, the migration is missing.
select
  definition
from pg_views
where schemaname = 'public'
  and viewname = 'v_leaderboard';
