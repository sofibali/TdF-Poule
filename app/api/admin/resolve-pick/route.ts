// Resolve a single ambiguous (or unmatched) team_riders pick by setting
// rider_id explicitly. Body: { team_rider_id: uuid, rider_id: uuid }.
// Updates match_status to 'manual'.

import { NextResponse, type NextRequest } from "next/server";

import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    team_rider_id?: string;
    rider_id?: string | null;
    note?: string;
  };
  if (!body.team_rider_id) {
    return NextResponse.json({ error: "Missing team_rider_id" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from("team_riders")
    .update({
      rider_id: body.rider_id ?? null,
      match_status: "manual",
      match_candidates: null,
      admin_note: body.note ?? null,
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
    })
    .eq("id", body.team_rider_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
