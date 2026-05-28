// Confirm and import a previously parsed pool. Body: ParsedPool JSON
// (with any "Unknown_N" players renamed by the admin in the preview UI).

import { NextResponse, type NextRequest } from "next/server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { ParsedPool } from "@/lib/parsers/types";
import { resolveTeamPicks } from "@/lib/scoring/resolve-picks";

export async function POST(request: NextRequest) {
  // Auth check (separate from service-role client used to write).
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let parsed: ParsedPool;
  try {
    parsed = (await request.json()) as ParsedPool;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!parsed.year) {
    return NextResponse.json(
      { error: "Year missing — can't import without a year" },
      { status: 400 },
    );
  }

  const svc = createServiceClient();

  // 1) Pool
  const { data: pool, error: poolErr } = await svc
    .from("pools")
    .upsert(
      {
        year: parsed.year,
        name: `Tour de France ${parsed.year}`,
        reserves_allowed: Math.max(
          3,
          ...parsed.teams.map((t) => t.reserves.length),
        ),
        notes: `Imported from ${parsed.source}`,
      },
      { onConflict: "year" },
    )
    .select()
    .single();
  if (poolErr || !pool) {
    return NextResponse.json(
      { error: poolErr?.message || "Pool upsert failed" },
      { status: 500 },
    );
  }

  // 2) Teams + team_riders
  // Track every team_id we touched in this import, so we can delete leftovers
  // afterward. This handles the rename case: if a team was previously called
  // "Unknown_6" and the admin renamed it to "Eelco" in the upload preview,
  // upsert(on_conflict=name) creates a NEW team rather than updating — we
  // need to clean up the orphan or it lingers on the leaderboard.
  const importedTeamIds: string[] = [];
  let imported = 0;
  for (const team of parsed.teams) {
    const teamLabel =
      `${team.player}'s ${team.team_name}`.trim() || team.player;
    const { data: tr, error: te } = await svc
      .from("teams")
      .upsert(
        {
          pool_id: pool.id,
          name: teamLabel,
          player_name: team.player,
          source_doc: parsed.source,
        },
        { onConflict: "pool_id,name" },
      )
      .select()
      .single();
    if (te || !tr) continue;

    importedTeamIds.push(tr.id);

    // Preserve any existing manual resolutions: fetch current picks, then
    // when re-inserting use the OLD rider_id + match_status if the raw_name
    // hasn't changed. This means the admin doesn't lose their click-by-click
    // fixes if they re-upload the same team after refining a few names.
    const { data: existingPicks } = await svc
      .from("team_riders")
      .select("raw_name, rider_id, match_status, match_candidates")
      .eq("team_id", tr.id);
    const existingByName = new Map<
      string,
      {
        rider_id: string | null;
        match_status: "matched" | "ambiguous" | "unmatched" | "manual";
        match_candidates: unknown;
      }
    >();
    for (const p of existingPicks ?? []) {
      existingByName.set(p.raw_name.trim().toLowerCase(), {
        rider_id: p.rider_id,
        match_status: p.match_status,
        match_candidates: p.match_candidates,
      });
    }

    await svc.from("team_riders").delete().eq("team_id", tr.id);

    function carryForward(raw: string) {
      const prev = existingByName.get(raw.trim().toLowerCase());
      return {
        rider_id: prev?.rider_id ?? null,
        match_status: prev?.match_status ?? ("unmatched" as const),
        match_candidates: prev?.match_candidates ?? null,
      };
    }

    const picks = [
      ...team.riders.map((raw, idx) => ({
        team_id: tr.id,
        raw_name: raw,
        is_reserve: false,
        pick_order: idx + 1,
        ...carryForward(raw),
      })),
      ...team.reserves.map((raw, idx) => ({
        team_id: tr.id,
        raw_name: raw,
        is_reserve: true,
        reserve_order: idx + 1,
        ...carryForward(raw),
      })),
    ];
    if (picks.length > 0) {
      await svc.from("team_riders").insert(picks);
    }
    imported++;
  }

  // 2b) Delete any teams in this pool that this upload didn't touch — those
  // are orphans (e.g. an old "Unknown_6" left over after we renamed it to
  // "Eelco"). team_riders cascade-delete with the parent row.
  let orphansRemoved = 0;
  if (importedTeamIds.length > 0) {
    const { data: orphans } = await svc
      .from("teams")
      .select("id, name")
      .eq("pool_id", pool.id)
      .not("id", "in", `(${importedTeamIds.map((id) => `"${id}"`).join(",")})`);
    if (orphans && orphans.length > 0) {
      const { error: delErr } = await svc
        .from("teams")
        .delete()
        .in(
          "id",
          orphans.map((o) => o.id as string),
        );
      if (!delErr) orphansRemoved = orphans.length;
    }
  }

  // 3) Auto-resolve picks against the existing riders table (if any).
  // This way the leaderboard scores immediately after import — no need
  // for the admin to click Refresh just to re-match names.
  let resolved = 0;
  let ambiguous = 0;
  let unmatched = 0;
  try {
    const r = await resolveTeamPicks(svc, pool.id);
    resolved = r.resolved;
    ambiguous = r.ambiguous;
    unmatched = r.unmatched;
  } catch (e) {
    // Don't fail the whole import if matching has issues — the picks are
    // still in the DB with match_status='unmatched' and admin can fix on
    // /admin/results.
    console.error("resolveTeamPicks failed:", e);
  }

  // 4) Audit row
  await svc.from("import_log").insert({
    pool_id: pool.id,
    kind: parsed.source.toLowerCase().endsWith(".docx")
      ? "teams_docx"
      : "teams_csv",
    message: `Imported ${imported} teams (${parsed.unresolved.length} unresolved at parse, ${orphansRemoved} orphans removed, ${resolved}/${ambiguous}/${unmatched} picks).`,
    details: {
      unresolved: parsed.unresolved,
      orphans_removed: orphansRemoved,
      picks_resolved: resolved,
      picks_ambiguous: ambiguous,
      picks_unmatched: unmatched,
      imported_by: user.email ?? user.id,
    },
  });

  return NextResponse.json({
    pool_id: pool.id,
    year: parsed.year,
    teams_imported: imported,
    orphans_removed: orphansRemoved,
    picks_resolved: resolved,
    picks_ambiguous: ambiguous,
    picks_unmatched: unmatched,
  });
}
