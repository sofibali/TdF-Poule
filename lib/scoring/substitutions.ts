// TypeScript mirror of the team_pick_events SQL function. Used by the team
// detail page to render rider statuses (active / dropped / didn't start /
// reserve used / reserve unused) when the database isn't reachable from
// a server component (or for local rendering / tests).

import type { TeamRider } from "@/lib/db/types";

export type RiderDropout = {
  rider_id: string;
  dropout_after_stage: number;
};

export type PickEvent =
  | {
      kind: "main";
      team_rider_id: string;
      raw_name: string;
      pick_order: number | null;
      status: "active" | "dropped_out" | "didnt_start";
      dropout_after_stage: number | null;
    }
  | {
      kind: "reserve";
      team_rider_id: string;
      raw_name: string;
      reserve_order: number;
      status: "used" | "unused" | "didnt_start";
      joined_at_stage: number | null;
      replaced_team_rider_id: string | null;
      replaced_raw_name: string | null;
    };

const RESERVE_LOCK_STAGE = 6;

export function computePickEvents(
  picks: TeamRider[],
  dropouts: RiderDropout[],
): PickEvent[] {
  const dropMap = new Map<string, number>();
  for (const d of dropouts) dropMap.set(d.rider_id, d.dropout_after_stage);

  const main = picks
    .filter((p) => !p.is_reserve)
    .sort((a, b) => (a.pick_order ?? 0) - (b.pick_order ?? 0));
  const reserves = picks
    .filter((p) => p.is_reserve)
    .sort((a, b) => (a.reserve_order ?? 0) - (b.reserve_order ?? 0));

  // For each main pick, the latest stage they were active.
  // 0 = never started; 99 = finished the whole Tour.
  const lastActiveByPick = new Map<string, number>();
  for (const m of main) {
    if (m.match_status === "unmatched" || m.match_status === "ambiguous") {
      lastActiveByPick.set(m.id, 0);
    } else {
      const drop =
        m.rider_id != null ? dropMap.get(m.rider_id) ?? null : null;
      lastActiveByPick.set(m.id, drop ?? 99);
    }
  }

  // Build vacancies in fill order: (stage asc, pick_order asc).
  type Vacancy = {
    stage: number;
    main_team_rider_id: string;
    main_raw_name: string;
    main_pick_order: number;
  };
  const vacancies: Vacancy[] = [];
  for (const m of main) {
    const last = lastActiveByPick.get(m.id) ?? 0;
    if (last < RESERVE_LOCK_STAGE) {
      // The first stage they're vacant
      const firstVacantStage = Math.max(1, last + 1);
      if (firstVacantStage <= RESERVE_LOCK_STAGE) {
        vacancies.push({
          stage: firstVacantStage,
          main_team_rider_id: m.id,
          main_raw_name: m.raw_name,
          main_pick_order: m.pick_order ?? 0,
        });
      }
    }
  }
  vacancies.sort(
    (a, b) =>
      a.stage - b.stage || a.main_pick_order - b.main_pick_order,
  );

  // Pair vacancies with reserves in order. A reserve can fill iff matched.
  const usableReserves = reserves.filter(
    (r) => r.match_status !== "unmatched" && r.match_status !== "ambiguous",
  );
  const assignment = new Map<
    string,
    { joined_at_stage: number; replaced_team_rider_id: string; replaced_raw_name: string }
  >();
  for (
    let i = 0;
    i < Math.min(vacancies.length, usableReserves.length);
    i++
  ) {
    const v = vacancies[i];
    const r = usableReserves[i];
    assignment.set(r.id, {
      joined_at_stage: v.stage,
      replaced_team_rider_id: v.main_team_rider_id,
      replaced_raw_name: v.main_raw_name,
    });
  }

  const events: PickEvent[] = [];
  for (const m of main) {
    const last = lastActiveByPick.get(m.id) ?? 0;
    const status: "active" | "dropped_out" | "didnt_start" =
      last === 0 ? "didnt_start" : last >= 99 ? "active" : "dropped_out";
    events.push({
      kind: "main",
      team_rider_id: m.id,
      raw_name: m.raw_name,
      pick_order: m.pick_order,
      status,
      dropout_after_stage: status === "dropped_out" ? last : null,
    });
  }
  for (const r of reserves) {
    let status: "used" | "unused" | "didnt_start" = "unused";
    let joined_at_stage: number | null = null;
    let replaced_team_rider_id: string | null = null;
    let replaced_raw_name: string | null = null;
    if (r.match_status === "unmatched" || r.match_status === "ambiguous") {
      status = "didnt_start";
    } else if (assignment.has(r.id)) {
      const a = assignment.get(r.id)!;
      status = "used";
      joined_at_stage = a.joined_at_stage;
      replaced_team_rider_id = a.replaced_team_rider_id;
      replaced_raw_name = a.replaced_raw_name;
    }
    events.push({
      kind: "reserve",
      team_rider_id: r.id,
      raw_name: r.raw_name,
      reserve_order: r.reserve_order ?? 0,
      status,
      joined_at_stage,
      replaced_team_rider_id,
      replaced_raw_name,
    });
  }
  return events;
}
