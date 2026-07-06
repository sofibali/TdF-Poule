"use client";

import Link from "next/link";
import type { TeamStageMatrixRow } from "@/lib/db/types";

type Props = {
  rows: TeamStageMatrixRow[];
  gcByTeam: Record<string, number>;
  gcLocked: boolean;
};

function heatClass(points: number, max: number): string {
  if (!points || !max) return "";
  const pct = points / max;
  if (pct >= 1) return "bg-emerald-300/70 text-emerald-900 font-bold";
  if (pct >= 0.66) return "bg-emerald-200/60 text-emerald-800";
  if (pct >= 0.33) return "bg-emerald-100/50";
  return "bg-emerald-50/40";
}

export default function StageMatrix({ rows, gcByTeam, gcLocked }: Props) {
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

  const maxByStage = new Map<number, number>();
  for (const s of stageCols) {
    let m = 0;
    for (const t of teams.values()) m = Math.max(m, t.stages[s] ?? 0);
    maxByStage.set(s, m);
  }

  const teamRows = [...teams.values()].map((t) => {
    const stageTotal = stageCols.reduce((acc, s) => acc + (t.stages[s] ?? 0), 0);
    const gc = gcByTeam[t.team_id] ?? 0;
    return { ...t, stage_total: stageTotal, gc, total: stageTotal + (gcLocked ? gc : 0) };
  });
  teamRows.sort((a, b) => b.total - a.total);

  if (teamRows.length === 0 || stageCols.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-amber-300 bg-white/60 p-10 text-center">
        <div className="text-4xl">🏁</div>
        <p className="mt-3 text-sm font-medium text-slate-500">
          No stage data yet — check back after stage 1.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-amber-200/60 bg-white/90 shadow-sm backdrop-blur">
      <table className="text-sm">
        <thead className="bg-amber-50/80 text-xs uppercase tracking-wider text-amber-800/60">
          <tr>
            <th className="sticky left-0 z-10 bg-amber-50/95 px-4 py-3 text-left">Team</th>
            {stageCols.map((s) => (
              <th key={s} className="px-2 py-3 text-center font-mono min-w-[2rem]">
                {s}
              </th>
            ))}
            {gcLocked && <th className="px-3 py-3 text-right">GC</th>}
            <th className="px-3 py-3 text-right font-bold">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-amber-100/40">
          {teamRows.map((t, i) => (
            <tr key={t.team_id} className={i < 3 ? "bg-amber-50/30" : ""}>
              <td className="sticky left-0 z-10 bg-white/95 px-4 py-2">
                <Link
                  href={`/teams/${t.team_id}`}
                  className="hover:text-amber-700"
                >
                  <div className="font-medium flex items-center gap-1.5">
                    {i === 0 && <span>🥇</span>}
                    {i === 1 && <span>🥈</span>}
                    {i === 2 && <span>🥉</span>}
                    <span className="hover:underline">{t.team_name}</span>
                  </div>
                  <div className="text-xs text-slate-400">{t.player_name}</div>
                </Link>
              </td>
              {stageCols.map((s) => {
                const v = t.stages[s] ?? 0;
                return (
                  <td
                    key={s}
                    className={`px-2 py-2 text-center tabular-nums text-xs ${heatClass(
                      v,
                      maxByStage.get(s) ?? 0,
                    )}`}
                  >
                    {v || <span className="text-slate-200">-</span>}
                  </td>
                );
              })}
              {gcLocked && (
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                  {t.gc || ""}
                </td>
              )}
              <td className="px-3 py-2 text-right tabular-nums font-bold text-slate-900">
                {t.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-amber-100/60 bg-amber-50/40 px-4 py-2 text-xs text-amber-700/50">
        Green = stage winner · scroll right for all stages
      </div>
    </div>
  );
}
