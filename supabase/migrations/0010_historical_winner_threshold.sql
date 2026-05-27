-- ============================================================================
-- Historical winners: only count completed Tours.
--
-- Previously v_historical_winners returned rank=1 for every pool — but rank()
-- ties everyone at #1 when nobody has scored, so an empty year with 16 teams
-- showed all 16 as "winners". Filter to pools that have at least one stage
-- result + a non-zero point total.
-- ============================================================================

create or replace view public.v_historical_winners as
  select
    p.year,
    lb.team_id,
    lb.name        as team_name,
    lb.player_name,
    lb.total_points
  from public.v_leaderboard lb
  join public.pools p on p.id = lb.pool_id
  where lb.rank = 1
    -- Require at least some scoring to have happened, else everyone's tied at 0.
    and lb.total_points > 0
    -- And require results actually exist for this pool.
    and exists (
      select 1 from public.stage_results sr where sr.pool_id = lb.pool_id
    );
