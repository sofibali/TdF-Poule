"use client";

import type { RiderStagePointsRow, RiderTotalsRow } from "@/lib/db/types";
import { SortHeader, useSortable } from "@/components/useSortable";
import EggOrLink from "@/components/EggOrLink";

type Props = {
  totals: RiderTotalsRow[];
  perStage: RiderStagePointsRow[];
  perfectTeamSize?: number;
};

type Row = RiderTotalsRow & {
  stages: Record<number, number>;
  perfect: boolean;
  [k: `stage_${number}`]: number;
};

function riderUrl(pcs_slug: string | null | undefined, name: string) {
  return pcs_slug
    ? `https://www.letour.fr/en/rider/${pcs_slug}`
    : `https://www.google.com/search?q=${encodeURIComponent(name + " cyclist")}`;
}

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

  const rows: Row[] = totals.map((t) => {
    const stages =
      stagesByKey.get((t.rider_id ?? t.rider_name.toLowerCase()) as string) ??
      {};
    const flat: Record<string, number> = {};
    for (const s of stageCols) flat[`stage_${s}`] = stages[s] ?? 0;
    return {
      ...t,
      stages,
      ...flat,
      perfect: t.overall_rank <= perfectTeamSize,
    } as Row;
  });

  const sort = useSortable<Row>(rows, "total_points", "desc");

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-amber-300 bg-white/60 p-10 text-center">
        <div className="text-4xl">🚴</div>
        <p className="mt-3 text-sm font-medium text-slate-500">
          No riders have scored yet.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-amber-200/60 bg-white/90 shadow-sm backdrop-blur">
      <table className="text-sm">
        <thead className="bg-amber-50/80 text-xs uppercase tracking-wider text-amber-800/60">
          <tr>
            <SortHeader<Row> label="Rider" sortKey="rider_name" state={sort} numeric={false} className="sticky left-0 z-10 bg-amber-50/95 text-left" />
            <SortHeader<Row> label="Total" sortKey="total_points" state={sort} className="text-right font-bold" />
            {stageCols.map((s) => {
              const key = `stage_${s}` as keyof Row;
              const active = sort.key === key;
              const arrow = !active ? "↕" : sort.dir === "asc" ? "▲" : "▼";
              return (
                <th
                  key={s}
                  onClick={() => sort.clickHeader(key, true)}
                  className={`cursor-pointer select-none px-2 py-3 text-center font-mono ${active ? "text-slate-900" : "hover:text-slate-700"}`}
                  title={`Sort by stage ${s}`}
                >
                  {s}
                  <span
                    className={`ml-0.5 text-[0.55rem] ${active ? "opacity-100" : "opacity-30"}`}
                  >
                    {arrow}
                  </span>
                </th>
              );
            })}
            <SortHeader<Row> label="GC" sortKey="gc_points" state={sort} className="text-right" />
            <SortHeader<Row> label="Team" sortKey="pro_team" state={sort} numeric={false} className="text-left" />
          </tr>
        </thead>
        <tbody className="divide-y divide-amber-100/40">
          {sort.rows.map((r) => (
            <tr key={`${r.rider_id ?? r.rider_name}`} className={r.perfect ? "bg-emerald-50/50" : ""}>
              <td className={`sticky left-0 z-10 px-4 py-2 ${r.perfect ? "bg-emerald-50/80" : "bg-white/95"}`}>
                <span className="mr-2 text-xs tabular-nums text-slate-400">
                  {r.overall_rank}
                </span>
                <a
                  href={riderUrl(r.pcs_slug, r.rider_name)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-medium text-slate-800 hover:text-amber-700 hover:underline"
                >
                  {r.rider_name}
                </a>
                {r.bib_number != null && (
                  <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-500">
                    #{r.bib_number}
                  </span>
                )}
                {r.perfect && (
                  <span className="ml-1 text-xs text-emerald-600">★</span>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-bold">
                {r.total_points}
              </td>
              {stageCols.map((s) => {
                const v = r.stages[s] ?? 0;
                return (
                  <td
                    key={s}
                    className={`px-2 py-2 text-center tabular-nums text-xs ${
                      v ? "font-medium text-slate-800" : "text-slate-200"
                    }`}
                  >
                    {v || "-"}
                  </td>
                );
              })}
              <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                {r.gc_points || ""}
              </td>
              <td className="px-3 py-2 text-slate-500 whitespace-nowrap text-xs">
                {r.pro_team ?? <span className="text-slate-200">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-amber-100/60 bg-amber-50/40 px-4 py-2 text-xs text-amber-700/50">
        Green rows = the perfect team (top {perfectTeamSize}) · click headers to sort
      </div>
    </div>
  );
}
