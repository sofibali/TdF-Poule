"use client";

// "All teams · stages" matrix. Rows = teams, columns = stage numbers.
// Per-stage top scorer cell is highlighted with a green heatmap.

import Link from "next/link";

import type { TeamStageMatrixRow } from "@/lib/db/types";

type Props = {
  rows: TeamStageMatrixRow[];
  gcByTeam: Record<string, number>;
};

function heatClass(points: number, max: number): string {
  if (!points || !max) return "";
  const pct = points / max;
  if (pct >= 1) return "bg-emerald-200/80 text-emerald-900 font-semibold";
  if (pct >= 0.66) return "bg-emerald-100/80";
  if (pct >= 0.33) return "bg-emerald-50/80";
  return "bg-emerald-50/40";
}

export default function StageMatrix({ rows, gcByTeam }: Props) {
  // Pivot rows into team × stage map.
  const teams = new Map<
    string,
    {
      team_id: string;
      team_name: string;
      player_name: string | null;
      stages: Record<number, number>;
    }
  >();
  const stageSet = new Set<number>();
  for (const r of rows) {
    stageSet.add(r.stage);
    let t = teams.get(r.team_id);
    if (!t) {
      t = {
        team_id: r.team_id,
        team_name: r.team_name,
        player_name: r.player_name,
        stages: {},
      };
      teams.set(r.team_id, t);
    }
    t.stages[r.stage] = r.points;
  }
  const stageCols = [...stageSet].sort((a, b) => a - b);

  // Per-stage max for heatmap.
  const maxByStage = new Map<number, number>();
  for (const s of stageCols) {
    let m = 0;
    for (const t of teams.values()) m = Math.max(m, t.stages[s] ?? 0);
    maxByStage.set(s, m);
  }

  // Sort teams by total desc.
  const teamRows = [...teams.values()].map((t) => {
    const stageTotal = stageCols.reduce((acc, s) => acc + (t.stages[s] ?? 0), 0);
    const gc = gcByTeam[t.team_id] ?? 0;
    return { ...t, stage_total: stageTotal, gc, total: stageTotal + gc };
  });
  teamRows.sort((a, b) => b.total - a.total);

  if (teamRows.length === 0 || stageCols.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        No stage data yet — check back after stage 1.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left">Team</th>
            {stageCols.map((s) => (
              <th key={s} className="px-2 py-3 text-center font-mono">
                {s}
              </th>
            ))}
            <th className="px-3 py-3 text-right">GC</th>
            <th className="px-3 py-3 text-right font-bold">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {teamRows.map((t) => (
            <tr key={t.team_id}>
              <td className="sticky left-0 z-10 bg-white px-4 py-2">
                <Link
                  href={`/teams/${t.team_id}`}
                  className="text-slate-800 hover:text-blue-600 hover:underline"
                >
                  <div className="font-medium">{t.team_name}</div>
                  <div className="text-xs text-slate-400">{t.player_name}</div>
                </Link>
              </td>
              {stageCols.map((s) => {
                const v = t.stages[s] ?? 0;
                return (
                  <td
                    key={s}
                    className={`px-2 py-2 text-center tabular-nums ${heatClass(
                      v,
                      maxByStage.get(s) ?? 0,
                    )}`}
                  >
                    {v || ""}
                  </td>
                );
              })}
              <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                {t.gc || ""}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-bold">
                {t.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
