-- ============================================================================
-- Row Level Security
--
-- Access model:
--   PUBLIC (anon role)        — read everything except import_log
--   AUTHENTICATED (admin)     — read + write everything
--
-- "Authenticated" here means anyone with a valid Supabase auth session, which
-- in practice is just Sofia. If we ever add a second admin we'd add their
-- email to a small allowlist function and tighten the policies; for now any
-- successful magic-link login is admin.
-- ============================================================================

alter table public.pools          enable row level security;
alter table public.riders         enable row level security;
alter table public.rider_dropouts enable row level security;
alter table public.teams          enable row level security;
alter table public.team_riders    enable row level security;
alter table public.stage_results  enable row level security;
alter table public.final_gc       enable row level security;
alter table public.import_log     enable row level security;

-- ----- public read (family browsing the site, no login) -----
create policy "public read pools"          on public.pools          for select using (true);
create policy "public read riders"         on public.riders         for select using (true);
create policy "public read rider_dropouts" on public.rider_dropouts for select using (true);
create policy "public read teams"          on public.teams          for select using (true);
create policy "public read team_riders"    on public.team_riders    for select using (true);
create policy "public read stage_results"  on public.stage_results  for select using (true);
create policy "public read final_gc"       on public.final_gc       for select using (true);

-- import_log can leak raw scrape data — keep it admin-only.
create policy "admin read import_log" on public.import_log
  for select to authenticated using (true);

-- ----- admin write (any authenticated session) -----
create policy "admin write pools"          on public.pools
  for all to authenticated using (true) with check (true);
create policy "admin write riders"         on public.riders
  for all to authenticated using (true) with check (true);
create policy "admin write rider_dropouts" on public.rider_dropouts
  for all to authenticated using (true) with check (true);
create policy "admin write teams"          on public.teams
  for all to authenticated using (true) with check (true);
create policy "admin write team_riders"    on public.team_riders
  for all to authenticated using (true) with check (true);
create policy "admin write stage_results"  on public.stage_results
  for all to authenticated using (true) with check (true);
create policy "admin write final_gc"       on public.final_gc
  for all to authenticated using (true) with check (true);
create policy "admin write import_log"     on public.import_log
  for all to authenticated using (true) with check (true);
