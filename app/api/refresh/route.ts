// Manual on-demand refresh — same logic as the cron, but callable by an
// authenticated admin from /admin/refresh.

import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { refreshPool } from "@/lib/scraper/refresh";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { year?: number };
  const year = body.year ?? parseInt(process.env.TDF_YEAR || "2026", 10);

  try {
    const summary = await refreshPool(year);
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
