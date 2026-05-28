-- ============================================================================
-- Create empty pools for every Tour de France year from 2000 to current.
-- No teams attached — these are "historical context only" pools so the
-- Riders view + stage results can be populated from PCS even when nobody
-- played that year.
--
-- Idempotent: ON CONFLICT (year) DO NOTHING. Safe to re-run after adding
-- new years (e.g. when 2026 starts, this'll create the empty pool for it).
-- ============================================================================

do $$
declare
  y int;
  current_year int := extract(year from current_date)::int;
begin
  for y in 2000..current_year loop
    -- Skip 2020 if the user already imported a real pool for it (with
    -- reserves_allowed=5 from the COVID-era rules); ON CONFLICT handles that.
    insert into public.pools (year, name, reserves_allowed, notes)
    values (
      y,
      'Tour de France ' || y,
      3,
      'Historical pool — auto-created for results backfill'
    )
    on conflict (year) do nothing;
  end loop;
end;
$$;
