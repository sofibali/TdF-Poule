// Resolve team_riders.rider_id by matching raw_name against the canonical
// riders table. Shared by /api/admin/import (auto-match after upload) and
// the refresh pipeline (re-match after stage backfill).

import { createServiceClient } from "@/lib/supabase/server";
import { matchRider, type RiderRow } from "@/lib/scoring/canonical-match";

type SvcClient = ReturnType<typeof createServiceClient>;

export async function resolveTeamPicks(
  supabase: SvcClient,
  poolId: string,
): Promise<{ resolved: number; ambiguous: number; unmatched: number }> {
  // Year drives the per-year corrections map in the shared matcher.
  const { data: pool } = await supabase
    .from("pools")
    .select("year")
    .eq("id", poolId)
    .maybeSingle();
  const year = pool?.year ?? null;

  const { data: riders } = await supabase
    .from("riders")
    .select("id, full_name, last_name")
    .eq("pool_id", poolId);
  if (!riders || riders.length === 0) {
    return { resolved: 0, ambiguous: 0, unmatched: 0 };
  }

  const { data: teams } = await supabase
    .from("teams")
    .select("id")
    .eq("pool_id", poolId);
  const teamIds = (teams ?? []).map((t) => t.id);
  if (teamIds.length === 0) {
    return { resolved: 0, ambiguous: 0, unmatched: 0 };
  }

  // Don't touch picks that an admin has explicitly resolved (match_status =
  // 'manual'). Auto-matching can re-run safely on everything else.
  const { data: picks } = await supabase
    .from("team_riders")
    .select("id, raw_name, match_status")
    .in("team_id", teamIds)
    .neq("match_status", "manual");

  let resolved = 0;
  let ambiguous = 0;
  let unmatched = 0;
  for (const r of picks ?? []) {
    const result = matchRider(r.raw_name, riders as RiderRow[], year);
    if (result.kind === "matched") {
      await supabase
        .from("team_riders")
        .update({
          rider_id: result.rider.id,
          match_status: "matched",
          match_candidates: null,
        })
        .eq("id", r.id);
      resolved++;
    } else if (result.kind === "ambiguous") {
      const cands = result.candidates.map((c) => ({
        rider_id: c.id,
        full_name: c.full_name,
      }));
      await supabase
        .from("team_riders")
        .update({
          rider_id: null,
          match_status: "ambiguous",
          match_candidates: cands,
        })
        .eq("id", r.id);
      ambiguous++;
    } else {
      await supabase
        .from("team_riders")
        .update({
          rider_id: null,
          match_status: "unmatched",
          match_candidates: null,
        })
        .eq("id", r.id);
      unmatched++;
    }
  }

  return { resolved, ambiguous, unmatched };
}
