-- Fix 6 unmatched/ambiguous picks from load-all-2026-teams.ts
-- O'Connor (ambiguous), Kanter (wrong first name), Fretin (wrong first name)
-- Wright / Meeus / Roglic = DNS, reserves substitute automatically.
--
-- Run in Supabase SQL editor, or:
--   pbcopy < scripts/fix-2026-picks.sql

-- O'Connor Ben #111
update public.team_riders tr
set    rider_id = r.id, match_status = 'matched', match_candidates = null
from   public.riders r
where  r.bib_number = 111
  and  r.pool_id = (select id from public.pools where year = 2026)
  and  lower(tr.raw_name) like '%connor%';

-- Max Kanter #64
update public.team_riders tr
set    rider_id = r.id, match_status = 'matched', match_candidates = null
from   public.riders r
where  r.bib_number = 64
  and  r.pool_id = (select id from public.pools where year = 2026)
  and  lower(tr.raw_name) like '%kanter%';

-- Milan Fretin #165
update public.team_riders tr
set    rider_id = r.id, match_status = 'matched', match_candidates = null
from   public.riders r
where  r.bib_number = 165
  and  r.pool_id = (select id from public.pools where year = 2026)
  and  lower(tr.raw_name) like '%fretin%';

-- Fred Wright #178 DNS: match pick + mark dropout
update public.team_riders tr
set    rider_id = r.id, match_status = 'manual'
from   public.riders r
where  r.bib_number = 178
  and  r.pool_id = (select id from public.pools where year = 2026)
  and  lower(tr.raw_name) like '%wright%';

insert into public.rider_dropouts (pool_id, rider_id, dropout_after_stage)
select pool_id, id, 0 from public.riders
where  bib_number = 178
  and  pool_id = (select id from public.pools where year = 2026)
on conflict (pool_id, rider_id) do update set dropout_after_stage = 0;

-- Meeus Jordi DNS: match pick + mark dropout
update public.team_riders tr
set    rider_id = r.id, match_status = 'manual'
from   public.riders r
where  lower(r.last_name) like '%meeus%'
  and  r.pool_id = (select id from public.pools where year = 2026)
  and  lower(tr.raw_name) like '%meeus%';

insert into public.rider_dropouts (pool_id, rider_id, dropout_after_stage)
select pool_id, id, 0 from public.riders
where  lower(last_name) like '%meeus%'
  and  pool_id = (select id from public.pools where year = 2026)
on conflict (pool_id, rider_id) do update set dropout_after_stage = 0;

-- Roglic Primoz DNS: match pick + mark dropout
update public.team_riders tr
set    rider_id = r.id, match_status = 'manual'
from   public.riders r
where  lower(r.last_name) like '%roglic%'
  and  r.pool_id = (select id from public.pools where year = 2026)
  and  lower(tr.raw_name) like '%roglic%';

insert into public.rider_dropouts (pool_id, rider_id, dropout_after_stage)
select pool_id, id, 0 from public.riders
where  lower(last_name) like '%roglic%'
  and  pool_id = (select id from public.pools where year = 2026)
on conflict (pool_id, rider_id) do update set dropout_after_stage = 0;
