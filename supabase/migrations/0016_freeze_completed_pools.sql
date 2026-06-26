-- ============================================================================
-- Freeze completed Tours. PCS is Cloudflare-protected and its /gc page parses
-- to the wrong table, so re-scraping a finished year OVERWRITES good, verified
-- results with garbage. A finished Tour's results are immutable — freeze them.
--
-- refreshPool() skips all scraping for a pool where frozen = true. Unfreeze a
-- year (set frozen = false) only when you deliberately want to re-scrape it.
-- ============================================================================

alter table public.pools
  add column if not exists frozen boolean not null default false;

-- Every Tour up to and including 2025 is over; freeze them all. A future live
-- year (e.g. 2026) is created with frozen = false and scrapes normally until
-- you freeze it after the race.
update public.pools set frozen = true where year <= 2025;
