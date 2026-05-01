// Daily Vercel Cron: pulls latest stage results from PCS into Postgres.
// Schedule lives in vercel.json (currently 21:00 UTC daily).

import { NextResponse, type NextRequest } from "next/server";

import { refreshPool } from "@/lib/scraper/refresh";

export async function GET(request: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when configured.
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const year = parseInt(process.env.TDF_YEAR || "2026", 10);
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
