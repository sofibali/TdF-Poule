-- Insert DNS riders who never appeared in stage results, match their picks,
-- and mark them as dropouts so their reserves substitute automatically.

-- 1) Insert them into the riders table (no bib needed for scoring to work).
insert into public.riders (pool_id, full_name, last_name)
values
  ((select id from public.pools where year = 2026), 'Jordi Meeus',   'Meeus'),
  ((select id from public.pools where year = 2026), 'Primoz Roglic', 'Roglic')
on conflict (pool_id, full_name) do nothing;

-- 2) Match the team_riders picks to the newly inserted rider rows.
update public.team_riders tr
set    rider_id = r.id, match_status = 'manual', match_candidates = null
from   public.riders r
where  r.pool_id = (select id from public.pools where year = 2026)
  and  r.full_name = 'Jordi Meeus'
  and  lower(tr.raw_name) like '%meeus%';

update public.team_riders tr
set    rider_id = r.id, match_status = 'manual', match_candidates = null
from   public.riders r
where  r.pool_id = (select id from public.pools where year = 2026)
  and  r.full_name = 'Primoz Roglic'
  and  lower(tr.raw_name) like '%roglic%';

-- 3) Mark them as DNS (dropout_after_stage = 0) so reserves kick in from stage 1.
insert into public.rider_dropouts (pool_id, rider_id, dropout_after_stage)
select
  (select id from public.pools where year = 2026),
  id,
  0
from public.riders
where pool_id  = (select id from public.pools where year = 2026)
  and full_name in ('Jordi Meeus', 'Primoz Roglic')
on conflict (pool_id, rider_id) do update set dropout_after_stage = 0;
