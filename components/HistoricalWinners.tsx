// Server-rendered list of all-time pool winners (rank-1 team per year).
// Click any row to inspect that year's full team breakdown.

import Link from "next/link";

export type HistoricalWinner = {
  year: number;
  team_id: string;
  team_name: string;
  player_name: string | null;
  total_points: number;
};

export default function HistoricalWinners({ winners }: { winners: HistoricalWinner[] }) {
  if (winners.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        No completed years yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-3 w-20">Year</th>
            <th className="px-4 py-3">Winning team</th>
            <th className="px-4 py-3 hidden sm:table-cell">Player</th>
            <th className="px-4 py-3 text-right">Points</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {winners.map((w) => (
            <tr key={w.year} className="hover:bg-slate-50/60">
              <td className="px-4 py-3 font-mono text-slate-500">
                <Link href={`/leaderboard?year=${w.year}`} className="hover:underline">
                  {w.year}
                </Link>
              </td>
              <td className="px-4 py-3 font-medium">
                <Link
                  href={`/teams/${w.team_id}`}
                  className="hover:text-blue-600 hover:underline"
                >
                  🏆 {w.team_name}
                </Link>
              </td>
              <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">
                {w.player_name}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-semibold">
                {w.total_points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
