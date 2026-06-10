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

  const { data: pools } = await supabase
    .from("pools")
    .select("year")
    .order("year", { ascending: false });
  const years = (pools ?? []).map((p) => p.year as number);

  const { data: defaultYearRpc } = await supabase.rpc(
    "most_recent_year_with_teams",
  );
  const year = searchParams.year
    ? parseInt(searchParams.year, 10)
    : (defaultYearRpc as number | null) ??
      years[0] ??
      parseInt(process.env.TDF_YEAR ?? "2026", 10);

  const [{ data: lb }, { data: hist }] = await Promise.all([
    supabase
      .from("v_leaderboard")
      .select("*")
      .eq("year", year)
      .order("rank", { ascending: true }),
    supabase
      .from("v_historical_winners")
      .select("*")
      .order("year", { ascending: false }),
  ]);

  const rows = (lb as LeaderboardRow[]) ?? [];
  const winners = (hist as HistoricalWinner[]) ?? [];

  return (
    <section className="space-y-12">
      <div>
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
              Leaderboard
            </h1>
            <p className="mt-1 text-sm text-amber-800/60">
              Tour de France {year} · {rows.length} team{rows.length === 1 ? "" : "s"}
              {" · "}updates live after each stage
            </p>
          </div>
          {years.length > 0 && <YearSelect years={years} current={year} />}
        </div>
        <div className="mt-6">
          <Leaderboard initial={rows} year={year} />
        </div>
      </div>

      {winners.length > 0 && (
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Hall of Fame
          </h2>
          <p className="mt-1 text-sm text-amber-800/60">
            Past champions. Click a year to relive the glory.
          </p>
          <div className="mt-6">
            <HistoricalWinners winners={winners} />
          </div>
        </div>
      )}
    </section>
  );
}
