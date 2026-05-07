-- ============================================================================
-- Bulletproof rider deduplication.
--
-- A SQL helper function `upsert_rider(pool, name, ...)` that:
--   1. Computes a sorted-token "match key" for the incoming name
--   2. Looks for an existing rider in the same pool with the same key
--   3. If found, top-ups missing fields (or replaces with a richer row)
--   4. If not, inserts a new rider
--
-- Plus a one-shot cleanup that collapses any pre-existing duplicates.
--
-- Why we can't just rely on TS dedup: Vercel's Edge runtime appears to be
-- producing different normalized keys than expected, and we can't easily
-- inspect that from outside. Doing the dedup in SQL guarantees correctness.
-- ============================================================================

-- Helper: sorted-token, case- and diacritic-insensitive match key.
create or replace function public.rider_match_key(s text)
returns text
language sql
immutable
as $$
  select coalesce(
    array_to_string(
      array(
        select t
        from unnest(
          regexp_split_to_array(
            translate(
              lower(coalesce(s, '')),
              'àáâãäåāèéêëēìíîïīòóôõöōùúûüūýÿñçčšćžđłøšğșțȃȧęõū',
              'aaaaaaaeeeeeiiiiioooooouuuuuyyncscszdlosgstauua'
            ),
            E'\\s+'
          )
        ) as t
        where t <> ''
        order by t
      ),
      '|'
    ),
    ''
  );
$$;

-- One-shot cleanup: drop any pre-existing duplicates per (pool, match_key),
-- keeping the row with the most info (pcs_slug + pro_team + mixed-case name).
do $$
declare
  v_pool_id uuid;
begin
  for v_pool_id in select id from public.pools loop
    with ranked as (
      select
        id,
        (case when pcs_slug is not null then 4 else 0 end) +
        (case when pro_team is not null then 2 else 0 end) +
        (case when full_name <> upper(full_name) then 1 else 0 end) as score,
        row_number() over (
          partition by public.rider_match_key(full_name)
          order by
            (case when pcs_slug is not null then 4 else 0 end) +
            (case when pro_team is not null then 2 else 0 end) +
            (case when full_name <> upper(full_name) then 1 else 0 end) desc,
            id
        ) as keep_rank
      from public.riders
      where pool_id = v_pool_id
    )
    delete from public.riders
    where id in (select id from ranked where keep_rank > 1);
  end loop;
end;
$$;

-- Atomic upsert function — call this instead of doing client-side dedup.
create or replace function public.upsert_rider(
  p_pool_id    uuid,
  p_full_name  text,
  p_last_name  text,
  p_pcs_slug   text default null,
  p_pro_team   text default null,
  p_bib_number int default null
) returns uuid
language plpgsql
as $$
declare
  v_match_key  text;
  v_existing   public.riders;
  v_existing_score int;
  v_new_score  int;
begin
  if p_full_name is null or p_full_name = '' then
    return null;
  end if;

  v_match_key := public.rider_match_key(p_full_name);

  -- Find an existing rider with the same sorted-token identity.
  select * into v_existing
  from public.riders
  where pool_id = p_pool_id
    and public.rider_match_key(full_name) = v_match_key
  limit 1;

  if v_existing.id is null then
    insert into public.riders
      (pool_id, full_name, last_name, pcs_slug, pro_team, bib_number)
    values
      (p_pool_id, p_full_name, p_last_name, p_pcs_slug, p_pro_team, p_bib_number)
    returning id into v_existing.id;
    return v_existing.id;
  end if;

  -- Score: prefer rows that have pcs_slug + pro_team and a mixed-case name.
  v_existing_score :=
    (case when v_existing.pcs_slug is not null then 4 else 0 end) +
    (case when v_existing.pro_team is not null then 2 else 0 end) +
    (case when v_existing.full_name <> upper(v_existing.full_name) then 1 else 0 end);
  v_new_score :=
    (case when p_pcs_slug is not null then 4 else 0 end) +
    (case when p_pro_team is not null then 2 else 0 end) +
    (case when p_full_name <> upper(p_full_name) then 1 else 0 end);

  if v_new_score > v_existing_score then
    update public.riders set
      full_name  = p_full_name,
      last_name  = p_last_name,
      pcs_slug   = coalesce(p_pcs_slug, v_existing.pcs_slug),
      pro_team   = coalesce(p_pro_team, v_existing.pro_team),
      bib_number = coalesce(p_bib_number, v_existing.bib_number)
    where id = v_existing.id;
  else
    -- Existing is richer — only top up null fields.
    update public.riders set
      pcs_slug   = coalesce(v_existing.pcs_slug, p_pcs_slug),
      pro_team   = coalesce(v_existing.pro_team, p_pro_team),
      bib_number = coalesce(v_existing.bib_number, p_bib_number)
    where id = v_existing.id;
  end if;

  return v_existing.id;
end;
$$;

-- Allow authenticated users (admin) to call this RPC.
grant execute on function public.upsert_rider(uuid, text, text, text, text, int)
  to authenticated;
grant execute on function public.upsert_rider(uuid, text, text, text, text, int)
  to service_role;
