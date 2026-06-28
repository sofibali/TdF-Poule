// Daily Vercel Cron: pulls the live edition's results from letour.fr into
// Postgres (PCS is Cloudflare-blocked). Schedule lives in vercel.json (21:00 UTC).
// letour.fr only serves the CURRENT edition, so this is correct for the live
// year (TDF_YEAR); frozen historical pools are skipped inside refreshLive.

import { NextResponse, type NextRequest } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { refreshLive } from "@/lib/scraper/live-refresh";

// A full pass fetches up to 21 stage pages + GC + withdrawals; allow 60s.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when configured.
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const year = parseInt(process.env.TDF_YEAR || "2026", 10);
  try {
    const summary = await refreshLive(createServiceClient(), year);
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
