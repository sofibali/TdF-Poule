-- ============================================================================
-- Tour de France Pool — initial schema
--
-- Tables (in dependency order):
--   pools          one row per year
--   riders         the year's peloton (canonical rider list)
--   rider_dropouts riders who abandoned the Tour, with the last stage they completed
--   teams          a participant's pool entry ("Sofia's Team")
--   team_riders    the riders/reserves picked for a team, with match resolution
--   stage_results  top finishers for each stage
--   final_gc       final General Classification
--   import_log     audit trail for uploads + scrapes
-- ============================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- pools
-- ----------------------------------------------------------------------------
create table public.pools (
  id                uuid primary key default gen_random_uuid(),
  year              int  not null unique,
  name              text not null,
  start_date        date,
  deadline          timestamptz,                  -- after this, /admin/upload locks teams
  num_stages        int  not null default 21,
  reserves_allowed  int  not null default 3,      -- COVID years had different counts;
                                                  -- the parser reads this from the docx header
  notes             text,
  created_at        timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- riders — canonical peloton for a given pool/year
--
-- Populated either by scraping the start list from PCS, or by the first stage
-- result we fetch (top 50 + however many additional finishers we encounter).
-- The team_riders fuzzy matcher resolves raw names typed in the doc against
-- this table.
-- ----------------------------------------------------------------------------
create table public.riders (
  id           uuid primary key default gen_random_uuid(),
  pool_id      uuid not null references public.pools(id) on delete cascade,
  full_name    text not null,
  last_name    text not null,
  pcs_slug     text,            -- e.g. "tadej-pogacar" — for deep-linking
  pro_team     text,            -- e.g. "UAE Team Emirates"
  bib_number   int,
  created_at   timestamptz not null default now(),
  unique (pool_id, full_name)
);

-- Case-insensitive last-name index — drives the matcher: anyone with the same
-- last name as a typed pick is a candidate. If 1 → matched, 2+ → ambiguous.
create index riders_pool_lastname_idx
  on public.riders (pool_id, lower(last_name));

-- ----------------------------------------------------------------------------
-- rider_dropouts
--
-- A rider is "dropped" if they didn't finish stage N. The scraper marks them
-- here; the scoring function uses this to decide whether to apply a reserve
-- substitution (only valid for stages 1-6).
-- ----------------------------------------------------------------------------
create table public.rider_dropouts (
  pool_id              uuid not null references public.pools(id) on delete cascade,
  rider_id             uuid not null references public.riders(id) on delete cascade,
  dropout_after_stage  int  not null check (dropout_after_stage between 0 and 25),
  reason               text,
  primary key (pool_id, rider_id)
);

-- ----------------------------------------------------------------------------
-- teams
-- ----------------------------------------------------------------------------
create table public.teams (
  id           uuid primary key default gen_random_uuid(),
  pool_id      uuid not null references public.pools(id) on delete cascade,
  name         text not null,                   -- "Sofia's Team"
  player_name  text,                            -- "Sofia"
  source_doc   text,                            -- filename it was imported from
  created_at   timestamptz not null default now(),
  unique (pool_id, name)
);

-- ----------------------------------------------------------------------------
-- team_riders
--
-- Bridge table with match resolution metadata. The raw_name is what came
-- out of the docx; rider_id is the canonical match (nullable until resolved).
--
-- match_status:
--   matched     — exactly one rider has that last name in the year's peloton
--   ambiguous   — multiple candidates; admin needs to pick one (match_candidates
--                 holds an array of { rider_id, full_name, pro_team })
--   unmatched   — no candidate found; treated as a dropout for scoring
--                 (a reserve will fill in for stages 1-6)
--   manual      — admin manually set rider_id (overrides ambiguous/unmatched)
-- ----------------------------------------------------------------------------
create type public.match_status as enum ('matched', 'ambiguous', 'unmatched', 'manual');

create table public.team_riders (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references public.teams(id) on delete cascade,
  rider_id          uuid references public.riders(id) on delete set null,
  raw_name          text not null,                 -- exactly as typed in the docx
  is_reserve        boolean not null default false,
  reserve_order     int,                           -- 1, 2, 3 — used in order
  pick_order        int,                           -- order within the main team
  match_status      public.match_status not null default 'matched',
  match_candidates  jsonb,                         -- [{rider_id, full_name, pro_team}, ...]
  admin_note        text,                          -- Sofia's note on a manual resolution
  resolved_at       timestamptz,
  resolved_by       uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  -- A reserve must have a reserve_order; a main pick must not.
  check (
    (is_reserve = true  and reserve_order is not null) or
    (is_reserve = false and reserve_order is null)
  )
);

create index team_riders_team_idx     on public.team_riders (team_id);
create index team_riders_rider_idx    on public.team_riders (rider_id);
-- Speeds up the "what still needs admin attention?" query on /admin/upload.
create index team_riders_unresolved_idx
  on public.team_riders (team_id)
  where match_status in ('ambiguous', 'unmatched');

-- ----------------------------------------------------------------------------
-- stage_results
--
-- One row per (pool, stage, finishing position). raw_name preserves what PCS
-- returned so we can debug fuzzy-match failures; rider_id is the resolved
-- canonical rider. Top 10 are what scoring needs, but we store top ~50.
-- ----------------------------------------------------------------------------
create table public.stage_results (
  pool_id     uuid not null references public.pools(id) on delete cascade,
  stage       int  not null check (stage between 1 and 25),
  position    int  not null check (position > 0),
  rider_id    uuid references public.riders(id) on delete set null,
  raw_name    text not null,
  fetched_at  timestamptz not null default now(),
  primary key (pool_id, stage, position)
);

create index stage_results_rider_idx on public.stage_results (rider_id);

-- ----------------------------------------------------------------------------
-- final_gc
-- ----------------------------------------------------------------------------
create table public.final_gc (
  pool_id     uuid not null references public.pools(id) on delete cascade,
  position    int  not null check (position > 0),
  rider_id    uuid references public.riders(id) on delete set null,
  raw_name    text not null,
  fetched_at  timestamptz not null default now(),
  primary key (pool_id, position)
);

create index final_gc_rider_idx on public.final_gc (rider_id);

-- ----------------------------------------------------------------------------
-- import_log
--
-- Audit trail. Useful for "why did this team show up wrong?" forensics.
-- ----------------------------------------------------------------------------
create table public.import_log (
  id          uuid primary key default gen_random_uuid(),
  pool_id     uuid references public.pools(id) on delete cascade,
  kind        text not null,           -- 'teams_docx' | 'teams_csv' | 'stage_fetch' | 'gc_fetch' | 'manual'
  message     text,
  details     jsonb,
  created_at  timestamptz not null default now()
);

create index import_log_pool_idx on public.import_log (pool_id, created_at desc);
