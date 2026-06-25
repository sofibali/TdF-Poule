-- ============================================================================
-- Final-GC points count for MAIN riders only, not reserves.
--
-- House rule (confirmed against the hand-kept 2024 scores): a rider sitting in
-- your reserves does NOT earn you final-classification points — only your main
-- team does. The original v_team_gc_points summed over the whole roster, which
-- inflated teams that happened to carry a top-10 GC finisher as a reserve.
-- ============================================================================

create or replace view public.v_team_gc_points as
  select
    t.id as team_id,
    t.pool_id,
    coalesce(sum(gpt.points), 0) as points
  from public.teams t
  left join public.team_riders tr
    on tr.team_id = t.id
   and tr.is_reserve = false          -- mains only
  left join public.final_gc fg
    on fg.pool_id = t.pool_id
   and fg.rider_id = tr.rider_id
  left join public.gc_point_table gpt on gpt.position = fg.position
  group by t.id, t.pool_id;
