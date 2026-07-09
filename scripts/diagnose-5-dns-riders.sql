-- Are Meeus and Roglic in the riders table? What are their bib numbers?
select id, full_name, last_name, bib_number, pro_team
from public.riders
where pool_id = (select id from public.pools where year = 2026)
  and (lower(full_name) like '%meeus%' or lower(full_name) like '%roglic%'
    or lower(last_name) like '%meeus%' or lower(last_name) like '%roglic%')
order by full_name;
