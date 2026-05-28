// Resolve team_riders.rider_id by matching raw_name against the canonical
// riders table. Shared by /api/admin/import (auto-match after upload) and
// the refresh pipeline (re-match after stage backfill).

import type { SupabaseClient } from "@supabase/supabase-js";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
}

type RiderRow = {
  id: string;
  full_name: string;
  last_name: string;
};

function matchRider(
  rawName: string,
  riders: RiderRow[],
):
  | { kind: "matched"; rider: RiderRow }
  | { kind: "ambiguous"; candidates: RiderRow[] }
  | { kind: "unmatched" } {
  const tokens = rawName
    .replace(/[,]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return { kind: "unmatched" };

  const pickedLast = normalize(tokens[tokens.length - 1]);
  const pickedInitial =
    tokens.length > 1 ? normalize(tokens.slice(0, -1).join(" ")) : null;

  const candidates = riders.filter((r) => {
    const lastNorm = normalize(r.last_name);
    if (lastNorm === pickedLast) return true;
    const fullTokens = r.full_name.split(/\s+/).map(normalize);
    return fullTokens.some((t) => t === pickedLast);
  });

  if (candidates.length === 0) return { kind: "unmatched" };
  if (candidates.length === 1) return { kind: "matched", rider: candidates[0] };

  if (pickedInitial) {
    const narrowed = candidates.filter((r) => {
      const ts = r.full_name.split(/\s+/).map(normalize);
      const others = ts.filter((t) => t !== pickedLast);
      return others.some((t) =>
        pickedInitial.length === 1
          ? t.startsWith(pickedInitial)
          : t === pickedInitial || t.startsWith(pickedInitial),
      );
    });
    if (narrowed.length === 1) return { kind: "matched", rider: narrowed[0] };
    if (narrowed.length > 0) return { kind: "ambiguous", candidates: narrowed };
  }

  return { kind: "ambiguous", candidates };
}

export async function resolveTeamPicks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public", any>,
  poolId: string,
): Promise<{ resolved: number; ambiguous: number; unmatched: number }> {
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

  const { data: picks } = await supabase
    .from("team_riders")
    .select("id, raw_name")
    .in("team_id", teamIds);

  let resolved = 0;
  let ambiguous = 0;
  let unmatched = 0;
  for (const r of picks ?? []) {
    const result = matchRider(r.raw_name, riders as RiderRow[]);
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
