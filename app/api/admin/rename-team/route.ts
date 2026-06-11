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

  const { team_id, name, player_name } = await request.json();
  if (!team_id) {
    return NextResponse.json({ error: "team_id required" }, { status: 400 });
  }

  const svc = createServiceClient();
  const update: Record<string, string> = {};
  if (typeof name === "string" && name.trim()) update.name = name.trim();
  if (typeof player_name === "string") update.player_name = player_name.trim();

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await svc
    .from("teams")
    .update(update)
    .eq("id", team_id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
