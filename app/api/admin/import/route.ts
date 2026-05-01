// Confirm and import a previously parsed pool. Body: ParsedPool JSON
// (with any "Unknown_N" players renamed by the admin in the preview UI).

import { NextResponse, type NextRequest } from "next/server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { ParsedPool } from "@/lib/parsers/types";

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

    await svc.from("team_riders").delete().eq("team_id", tr.id);

    const picks = [
      ...team.riders.map((raw, idx) => ({
        team_id: tr.id,
        raw_name: raw,
        is_reserve: false,
        pick_order: idx + 1,
        match_status: "unmatched" as const,
      })),
      ...team.reserves.map((raw, idx) => ({
        team_id: tr.id,
        raw_name: raw,
        is_reserve: true,
        reserve_order: idx + 1,
        match_status: "unmatched" as const,
      })),
    ];
    if (picks.length > 0) {
      await svc.from("team_riders").insert(picks);
    }
    imported++;
  }

  // 3) Audit row
  await svc.from("import_log").insert({
    pool_id: pool.id,
    kind: parsed.source.toLowerCase().endsWith(".docx")
      ? "teams_docx"
      : "teams_csv",
    message: `Imported ${imported} teams (${parsed.unresolved.length} unresolved at parse time).`,
    details: { unresolved: parsed.unresolved, imported_by: user.email ?? user.id },
  });

  return NextResponse.json({
    pool_id: pool.id,
    year: parsed.year,
    teams_imported: imported,
  });
}
