"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import type { LeaderboardRow } from "@/lib/db/types";
import { SortHeader, useSortable } from "@/components/useSortable";

type Props = { initial: LeaderboardRow[]; year: number; isLive?: boolean };

export default function Leaderboard({ initial, year, isLive = true }: Props) {
  const [rows, setRows] = useState<LeaderboardRow[]>(initial);
  const gcLocked = rows.some((r) => r.total_points !== r.stage_points);
  const router = useRouter();
  const sort = useSortable<LeaderboardRow>(rows, "rank", "asc");

  useEffect(() => {
    const supabase = createClient();

    async function refresh() {
      const { data, error } = await supabase
        .from("v_leaderboard")
        .select("*")
        .eq("year", year)
        .order("rank", { ascending: true });
      if (error) {
        console.error("Leaderboard refresh failed:", error);
        return;
      }
      if (data) setRows(data as LeaderboardRow[]);
    }

    refresh();

    const channel = supabase
      .channel(`leaderboard-${year}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stage_results" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "final_gc" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_riders" }, refresh)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [year]);

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-amber-300 bg-white/60 p-10 text-center">
        <div className="text-4xl">🏁</div>
        <p className="mt-3 text-sm font-medium text-slate-500">
          No scores yet — the race hasn&apos;t started! Check back after stage 1.
        </p>
      </div>
    );
  }

  const podiumMeta: Record<number, { emoji: string; cls: string; ring: string }> = {
    1: { emoji: "🥇", cls: "podium-gold", ring: "ring-amber-400" },
    2: { emoji: "🥈", cls: "podium-silver", ring: "ring-slate-400" },
    3: { emoji: "🥉", cls: "podium-bronze", ring: "ring-orange-400" },
  };

  const podiumRows = rows.filter((r) => r.rank <= 3);

  return (
    <div className="space-y-4">
      {/* Historical mode banner */}
      {!isLive && (
        <div className="rounded-lg border border-amber-300 bg-amber-50/80 px-4 py-3 text-sm text-amber-800">
          Historical data — reserve substitutions are not calculated. All picks score across all stages.
        </div>
      )}

      {/* Podium cards — only for the live year, 3+ teams */}
      {isLive && podiumRows.length >= 3 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {podiumRows
            .slice()
            .sort((a, b) => {
              // Desktop: silver | gold | bronze visual order via sm:order-* below
              // Mobile: always rank order (1, 2, 3) so stacked list reads naturally
              return a.rank - b.rank;
            })
            .map((r) => {
              const { emoji, cls, ring } = podiumMeta[r.rank] ?? {
                emoji: "",
                cls: "",
                ring: "ring-slate-300",
              };
              const orderCls =
                r.rank === 1 ? "sm:order-2" : r.rank === 2 ? "sm:order-1" : "sm:order-3";
              return (
                <div
                  key={r.team_id}
                  onClick={() => router.push(`/teams/${r.team_id}`)}
                  className={`${cls} ${orderCls} cursor-pointer select-none rounded-2xl p-4 ring-2 ${ring} transition-transform hover:scale-[1.02] active:scale-[0.98]`}
                >
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      <span className="text-2xl">{emoji}</span>
                      <div className="mt-1 font-bold text-lg leading-tight truncate">{r.name}</div>
                      <div className="text-xs text-slate-600 truncate">{r.player_name}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-2xl font-extrabold tabular-nums">{r.total_points}</div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">points</div>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-3 text-xs text-slate-600">
                    <span>Stages: {r.stage_points}</span>
                    {gcLocked && <span>GC: {r.gc_points}</span>}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* ── Mobile card list (hidden sm+) ── */}
      <ul className="sm:hidden space-y-2">
        {sort.rows.map((row) => {
          const medal =
            row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : null;
          const cardCls =
            row.rank === 1
              ? "bg-amber-50 border-amber-300"
              : row.rank === 2
                ? "bg-slate-50 border-slate-300"
                : row.rank === 3
                  ? "bg-orange-50 border-orange-300"
                  : "bg-white border-slate-200";
          return (
            <li
              key={row.team_id}
              onClick={() => router.push(`/teams/${row.team_id}`)}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer select-none
                transition-transform active:scale-[0.97] active:opacity-90 ${cardCls}`}
            >
              {/* Rank / medal */}
              <div className="w-7 shrink-0 text-center">
                {medal ? (
                  <span className="text-xl leading-none">{medal}</span>
                ) : (
                  <span className="text-slate-400 font-mono text-sm">{row.rank}</span>
                )}
              </div>

              {/* Name + player */}
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-900 truncate leading-tight">{row.name}</div>
                <div className="text-xs text-slate-500 truncate">{row.player_name}</div>
                {gcLocked && (
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    Stg&nbsp;{row.stage_points} · GC&nbsp;{row.gc_points}
                  </div>
                )}
              </div>

              {/* Points + chevron */}
              <div className="flex items-center gap-1 shrink-0">
                <div className="text-right">
                  <div className="text-xl font-extrabold tabular-nums text-slate-900">
                    {row.total_points}
                  </div>
                  <div className="text-[10px] text-slate-400 leading-none">pts</div>
                </div>
                <svg
                  className="w-4 h-4 text-slate-300 shrink-0"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </li>
          );
        })}
      </ul>

      {/* ── Desktop table (hidden on mobile) ── */}
      <div className="hidden sm:block overflow-hidden rounded-2xl border border-amber-200/60 bg-white/90 shadow-sm backdrop-blur">
        <table className="w-full text-sm">
          <thead className="bg-amber-50/80 text-left text-xs uppercase tracking-wider text-amber-800/60">
            <tr>
              <SortHeader<LeaderboardRow> label="#" sortKey="rank" state={sort} numeric />
              <SortHeader<LeaderboardRow> label="Team" sortKey="name" state={sort} numeric={false} />
              <SortHeader<LeaderboardRow> label="Player" sortKey="player_name" state={sort} numeric={false} />
              <SortHeader<LeaderboardRow> label="Stages" sortKey="stage_points" state={sort} className="text-right" />
              {gcLocked && <SortHeader<LeaderboardRow> label="GC" sortKey="gc_points" state={sort} className="text-right" />}
              <SortHeader<LeaderboardRow> label="Total" sortKey="total_points" state={sort} className="text-right font-bold" />
              {/* chevron column — no header */}
              <th className="w-6" />
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-100/60">
            {sort.rows.map((row) => {
              const medal =
                row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : null;
              const podium =
                row.rank === 1
                  ? "bg-amber-50/80 border-l-4 border-amber-400 font-semibold"
                  : row.rank === 2
                    ? "bg-slate-50/50 border-l-4 border-slate-400"
                    : row.rank === 3
                      ? "bg-orange-50/50 border-l-4 border-orange-400"
                      : "border-l-4 border-transparent";
              return (
                <tr
                  key={row.team_id}
                  onClick={() => router.push(`/teams/${row.team_id}`)}
                  className={`cursor-pointer select-none hover:bg-yellow-50/60 active:bg-amber-100/60 transition-colors ${podium}`}
                >
                  <td className="px-4 py-3 text-slate-500 font-mono">
                    {medal ? (
                      <span className="text-lg">{medal}</span>
                    ) : (
                      <span className="text-slate-400">{row.rank}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3 text-slate-500">{row.player_name}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                    {row.stage_points}
                  </td>
                  {gcLocked && (
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                      {row.gc_points}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-900">
                    {row.total_points}
                  </td>
                  <td className="pr-3 text-slate-300">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="border-t border-amber-100/60 bg-amber-50/40 px-4 py-2 text-xs text-amber-700/50">
          Tap a row to see the team · tap column headers to sort
        </div>
      </div>
    </div>
  );
}
