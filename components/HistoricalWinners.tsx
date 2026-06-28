import Link from "next/link";

import type { Champion } from "@/lib/data/champions";

export default function HistoricalWinners({
  champions,
  linkableYears,
}: {
  champions: Champion[];
  /** Years that have a viewable pool — those get a "relive" link. */
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

  // Most titles per person, most wins first (ties broken alphabetically).
  const counts = new Map<string, number>();
  for (const c of champions) counts.set(c.winner, (counts.get(c.winner) ?? 0) + 1);
  const titles = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const maxTitles = titles[0]?.[1] ?? 0;

  return (
    <div className="space-y-8">
      <div className="overflow-hidden rounded-2xl border border-amber-200/60 bg-white/90 shadow-sm backdrop-blur">
        <table className="w-full text-sm">
          <thead className="bg-amber-50/80 text-left text-xs uppercase tracking-wider text-amber-800/60">
            <tr>
              <th className="px-4 py-3 w-24">Year</th>
              <th className="px-4 py-3">Champion</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-100/60">
            {champions.map((c) => (
              <tr key={c.year} className="hover:bg-yellow-50/60 transition-colors">
                <td className="px-4 py-3 font-mono text-slate-500">{c.year}</td>
                <td className="px-4 py-3 font-medium">🏆 {c.winner}</td>
                <td className="px-4 py-3 text-right">
                  {linkable.has(c.year) && (
                    <Link
                      href={`/leaderboard?year=${c.year}`}
                      className="text-xs font-semibold text-amber-700/80 hover:text-amber-800 hover:underline"
                    >
                      Relive this year →
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Most titles */}
      <div>
        <h3 className="text-lg font-extrabold tracking-tight text-slate-900">
          Most titles
        </h3>
        <p className="mt-1 text-xs text-amber-800/60">
          Career wins per player since 1991.
        </p>
        <div className="mt-4 overflow-hidden rounded-2xl border border-amber-200/60 bg-white/90 shadow-sm backdrop-blur">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-amber-100/60">
              {titles.map(([name, n], i) => (
                <tr key={name} className="hover:bg-yellow-50/60 transition-colors">
                  <td className="px-4 py-2.5 w-10 text-right font-mono text-xs text-slate-400">
                    {i + 1}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-slate-800">{name}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 max-w-[160px] overflow-hidden rounded-full bg-amber-100">
                        <div
                          className="h-full rounded-full bg-amber-400"
                          style={{ width: `${(n / maxTitles) * 100}%` }}
                        />
                      </div>
                      <span className="tabular-nums text-xs font-bold text-amber-800">
                        {n} {n === 1 ? "title" : "titles"}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
