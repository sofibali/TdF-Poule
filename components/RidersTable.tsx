"use client";

// Per-rider stage points + GC + total. Top N rows are visually marked as
// the "perfect team you could have picked" in retrospect. Sortable.
//
// Each rider name is a link to their ProCyclingStats profile. Bib number
// shows next to the name, pro team shows in its own column. All three come
// from the riders table (populated by fetchStartList on first refresh).

import type { RiderStagePointsRow, RiderTotalsRow } from "@/lib/db/types";
import { SortHeader, useSortable } from "@/components/useSortable";

type Props = {
  totals: RiderTotalsRow[];
  perStage: RiderStagePointsRow[];
  perfectTeamSize?: number;
};

type Row = RiderTotalsRow & {
  stages: Record<number, number>;
  perfect: boolean;
};

const PCS_BASE = "https://www.procyclingstats.com/rider/";

export default function RidersTable({
  totals,
  perStage,
  perfectTeamSize = 15,
}: Props) {
  const stagesByKey = new Map<string, Record<number, number>>();
  const stageSet = new Set<number>();
  for (const s of perStage) {
    stageSet.add(s.stage);
    const key = (s.rider_id ?? s.rider_name.toLowerCase()) as string;
    const m = stagesByKey.get(key) ?? {};
    m[s.stage] = (m[s.stage] ?? 0) + s.points;
    stagesByKey.set(key, m);
  }
  const stageCols = [...stageSet].sort((a, b) => a - b);

  const rows: Row[] = totals.map((t) => ({
    ...t,
    stages:
      stagesByKey.get((t.rider_id ?? t.rider_name.toLowerCase()) as string) ??
      {},
    perfect: t.overall_rank <= perfectTeamSize,
  }));

  const sort = useSortable<Row>(rows, "total_points", "desc");

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        No riders have scored yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <SortHeader<Row> label="Rider" sortKey="rider_name" state={sort} numeric={false} className="sticky left-0 z-10 bg-slate-50 text-left" />
            <SortHeader<Row> label="Team" sortKey="pro_team" state={sort} numeric={false} className="text-left" />
            {stageCols.map((s) => (
              <th key={s} className="px-2 py-3 text-center font-mono">
                {s}
              </th>
            ))}
            <SortHeader<Row> label="GC" sortKey="gc_points" state={sort} className="text-right" />
            <SortHeader<Row> label="Total" sortKey="total_points" state={sort} className="text-right font-bold" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sort.rows.map((r) => (
            <tr key={`${r.rider_id ?? r.rider_name}`} className={r.perfect ? "bg-emerald-50/60" : ""}>
              <td className={`sticky left-0 z-10 px-4 py-2 ${r.perfect ? "bg-emerald-50/60" : "bg-white"}`}>
                <span className="mr-2 text-xs tabular-nums text-slate-400">
                  {r.overall_rank}
                </span>
                {r.pcs_slug ? (
                  <a
                    href={`${PCS_BASE}${r.pcs_slug}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-medium text-slate-800 hover:text-blue-600 hover:underline"
                  >
                    {r.rider_name}
                  </a>
                ) : (
                  <span className="font-medium text-slate-800">{r.rider_name}</span>
                )}
                {r.bib_number != null && (
                  <span className="ml-2 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-500">
                    #{r.bib_number}
                  </span>
                )}
                {r.perfect && (
                  <span className="ml-2 text-xs text-emerald-700">★</span>
                )}
              </td>
              <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                {r.pro_team ?? <span className="text-slate-300">—</span>}
              </td>
              {stageCols.map((s) => {
                const v = r.stages[s] ?? 0;
                return (
                  <td
                    key={s}
                    className={`px-2 py-2 text-center tabular-nums ${
                      v ? "font-medium text-slate-800" : "text-slate-300"
                    }`}
                  >
                    {v || "·"}
                  </td>
                );
              })}
              <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                {r.gc_points || ""}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-bold">
                {r.total_points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
        Click a rider name to open their ProCyclingStats profile · column headers sort.
        Rows in green = the perfect team you could have picked (top {perfectTeamSize}).
      </p>
    </div>
  );
}
