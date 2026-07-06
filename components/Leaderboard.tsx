"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import type { LeaderboardRow } from "@/lib/db/types";
import { SortHeader, useSortable } from "@/components/useSortable";

type Props = { initial: LeaderboardRow[]; year: number };

export default function Leaderboard({ initial, year }: Props) {
  const [rows, setRows] = useState<LeaderboardRow[]>(initial);
  // GC counts in totals only once stage 21 exists. Derive from data so the
  // live subscription automatically unlocks the column without a page reload.
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

  const leader = sort.rows[0];

  return (
    <div className="space-y-4">
      {/* Podium cards for top 3 */}
      {rows.length >= 3 && (
        <div className="grid gap-3 sm:grid-cols-3 mb-6">
          {[
            { rank: 1, emoji: "🥇", cls: "podium-gold", ring: "ring-amber-400" },
            { rank: 2, emoji: "🥈", cls: "podium-silver", ring: "ring-slate-400" },
            { rank: 3, emoji: "🥉", cls: "podium-bronze", ring: "ring-orange-400" },
          ].map(({ rank, emoji, cls, ring }) => {
            const r = rows.find((r) => r.rank === rank);
            if (!r) return null;
            return (
              <div
                key={rank}
                onClick={() => router.push(`/teams/${r.team_id}`)}
                className={`${cls} cursor-pointer rounded-2xl p-4 ring-2 ${ring} transition-transform hover:scale-[1.02] ${
                  rank === 1 ? "sm:order-2" : rank === 2 ? "sm:order-1" : "sm:order-3"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-2xl">{emoji}</span>
                    <div className="mt-1 font-bold text-lg leading-tight">{r.name}</div>
                    <div className="text-xs text-slate-600">{r.player_name}</div>
                  </div>
                  <div className="text-right">
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

      {/* Full standings table */}
      <div className="overflow-hidden rounded-2xl border border-amber-200/60 bg-white/90 shadow-sm backdrop-blur">
        <table className="w-full text-sm">
          <thead className="bg-amber-50/80 text-left text-xs uppercase tracking-wider text-amber-800/60">
            <tr>
              <SortHeader<LeaderboardRow> label="#" sortKey="rank" state={sort} numeric />
              <SortHeader<LeaderboardRow> label="Team" sortKey="name" state={sort} numeric={false} />
              <SortHeader<LeaderboardRow> label="Player" sortKey="player_name" state={sort} numeric={false} className="hidden sm:table-cell" />
              <SortHeader<LeaderboardRow> label="Stages" sortKey="stage_points" state={sort} className="text-right" />
              {gcLocked && <SortHeader<LeaderboardRow> label="GC" sortKey="gc_points" state={sort} className="text-right" />}
              <SortHeader<LeaderboardRow> label="Total" sortKey="total_points" state={sort} className="text-right font-bold" />
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
                  className={`cursor-pointer hover:bg-yellow-50/60 transition-colors ${podium}`}
                >
                  <td className="px-4 py-3 text-slate-500 font-mono">
                    {medal ? (
                      <span className="text-lg">{medal}</span>
                    ) : (
                      <span className="text-slate-400">{row.rank}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">
                    {row.player_name}
                  </td>
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
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="border-t border-amber-100/60 bg-amber-50/40 px-4 py-2 text-xs text-amber-700/50">
          Click a row to see the team details · click headers to sort
        </div>
      </div>
    </div>
  );
}
