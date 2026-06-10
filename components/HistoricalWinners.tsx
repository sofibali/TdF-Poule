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
      <div className="rounded-2xl border-2 border-dashed border-amber-300 bg-white/60 p-8 text-center text-sm text-slate-500">
        No completed years yet. Be the first champion!
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-amber-200/60 bg-white/90 shadow-sm backdrop-blur">
      <table className="w-full text-sm">
        <thead className="bg-amber-50/80 text-left text-xs uppercase tracking-wider text-amber-800/60">
          <tr>
            <th className="px-4 py-3 w-20">Year</th>
            <th className="px-4 py-3">Champion</th>
            <th className="px-4 py-3 hidden sm:table-cell">Player</th>
            <th className="px-4 py-3 text-right">Points</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-amber-100/60">
          {winners.map((w) => (
            <tr key={w.year} className="hover:bg-yellow-50/60 transition-colors">
              <td className="px-4 py-3 font-mono text-slate-500">
                <Link href={`/leaderboard?year=${w.year}`} className="hover:text-amber-700 hover:underline">
                  {w.year}
                </Link>
              </td>
              <td className="px-4 py-3 font-medium">
                <Link
                  href={`/teams/${w.team_id}`}
                  className="hover:text-amber-700 hover:underline"
                >
                  🏆 {w.team_name}
                </Link>
              </td>
              <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">
                {w.player_name}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-bold">
                {w.total_points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
