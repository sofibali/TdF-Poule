-- Helper RPC: returns the most recent year that actually has teams in it.
-- The leaderboard / matrix / riders pages call this to pick a sensible
-- default year (so historically-empty pools don't become the default).
create or replace function public.most_recent_year_with_teams()
returns int
language sql
stable
as $$
  select max(p.year)::int
  from public.pools p
  where exists (select 1 from public.teams t where t.pool_id = p.id);
$$;

grant execute on function public.most_recent_year_with_teams() to anon;
grant execute on function public.most_recent_year_with_teams() to authenticated;

-- Reload PostgREST schema so the RPC is callable immediately.
notify pgrst, 'reload schema';
