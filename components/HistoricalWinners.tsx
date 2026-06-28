import Link from "next/link";

import type { Champion } from "@/lib/data/champions";

export default function HistoricalWinners({
  champions,
  linkableYears,
}: {
  champions: Champion[];
  /** Years that have a viewable pool — those get a link to the leaderboard. */
  linkableYears: number[];
}) {
  if (champions.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-amber-300 bg-white/60 p-8 text-center text-sm text-slate-500">
        No champions recorded yet.
      </div>
    );
  }

  const linkable = new Set(linkableYears);

  return (
    <div className="overflow-hidden rounded-2xl border border-amber-200/60 bg-white/90 shadow-sm backdrop-blur">
      <table className="w-full text-sm">
        <thead className="bg-amber-50/80 text-left text-xs uppercase tracking-wider text-amber-800/60">
          <tr>
            <th className="px-4 py-3 w-24">Year</th>
            <th className="px-4 py-3">Champion</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-amber-100/60">
          {champions.map((c) => (
            <tr key={c.year} className="hover:bg-yellow-50/60 transition-colors">
              <td className="px-4 py-3 font-mono text-slate-500">
                {linkable.has(c.year) ? (
                  <Link
                    href={`/leaderboard?year=${c.year}`}
                    className="hover:text-amber-700 hover:underline"
                  >
                    {c.year}
                  </Link>
                ) : (
                  c.year
                )}
              </td>
              <td className="px-4 py-3 font-medium">🏆 {c.winner}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
