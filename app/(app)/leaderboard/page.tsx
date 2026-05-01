// Leaderboard page — current year's standings up top, all-time winners below.

import HistoricalWinners, { type HistoricalWinner } from "@/components/HistoricalWinners";
import Leaderboard from "@/components/Leaderboard";
import YearSelect from "@/components/YearSelect";
import { createClient } from "@/lib/supabase/server";
import type { LeaderboardRow } from "@/lib/db/types";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  const supabase = createClient();
  const year =
    parseInt(searchParams.year ?? process.env.TDF_YEAR ?? "2026", 10);

  const [{ data: lb }, { data: hist }, { data: pools }] = await Promise.all([
    supabase
      .from("v_leaderboard")
      .select("*")
      .eq("year", year)
      .order("rank", { ascending: true }),
    supabase
      .from("v_historical_winners")
      .select("*")
      .order("year", { ascending: false }),
    supabase.from("pools").select("year").order("year", { ascending: false }),
  ]);

  const rows = (lb as LeaderboardRow[]) ?? [];
  const winners = (hist as HistoricalWinner[]) ?? [];
  const years = (pools ?? []).map((p) => p.year as number);

  return (
    <section className="space-y-12">
      <div>
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Leaderboard</h1>
            <p className="mt-1 text-sm text-slate-500">
              Tour de France {year} · updates live after each stage
            </p>
          </div>
          {years.length > 0 && <YearSelect years={years} current={year} />}
        </div>
        <div className="mt-6">
          <Leaderboard initial={rows} year={year} />
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold tracking-tight">Historical winners</h2>
        <p className="mt-1 text-sm text-slate-500">
          Past pool champions. Click a year to view that year&apos;s standings.
        </p>
        <div className="mt-6">
          <HistoricalWinners winners={winners} />
        </div>
      </div>
    </section>
  );
}
