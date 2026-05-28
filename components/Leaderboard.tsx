"use client";

// Live leaderboard table. Server passes `initial` rows; this component
// subscribes to Realtime updates on stage_results / final_gc / team_riders
// and re-fetches the v_leaderboard view when anything changes.
//
// Whole-row click takes you to /teams/[id]; column headers sort.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import type { LeaderboardRow } from "@/lib/db/types";
import { SortHeader, useSortable } from "@/components/useSortable";

type Props = { initial: LeaderboardRow[]; year: number };

export default function Leaderboard({ initial, year }: Props) {
  const [rows, setRows] = useState<LeaderboardRow[]>(initial);
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
        // Don't blow away whatever we have if the refresh fails.
        // eslint-disable-next-line no-console
        console.error("Leaderboard refresh failed:", error);
        return;
      }
      if (data) setRows(data as LeaderboardRow[]);
    }

    // Run once on mount — covers the case where the server-rendered `initial`
    // data is stale (e.g. an /admin/refresh just happened in another tab).
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
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        No scores yet — check back after stage 1.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <SortHeader<LeaderboardRow> label="#" sortKey="rank" state={sort} numeric />
            <SortHeader<LeaderboardRow> label="Team" sortKey="name" state={sort} numeric={false} />
            <SortHeader<LeaderboardRow> label="Player" sortKey="player_name" state={sort} numeric={false} className="hidden sm:table-cell" />
            <SortHeader<LeaderboardRow> label="Stages" sortKey="stage_points" state={sort} className="text-right" />
            <SortHeader<LeaderboardRow> label="GC" sortKey="gc_points" state={sort} className="text-right" />
            <SortHeader<LeaderboardRow> label="Total" sortKey="total_points" state={sort} className="text-right font-bold" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sort.rows.map((row) => {
            const medal =
              row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : null;
            // Distinct gold / silver / bronze treatment for the podium —
            // left-border accent + soft background so the rows stand out.
            const podium =
              row.rank === 1
                ? "bg-gradient-to-r from-amber-100/80 to-amber-50/40 border-l-4 border-amber-400"
                : row.rank === 2
                  ? "bg-gradient-to-r from-slate-200/70 to-slate-50/30 border-l-4 border-slate-400"
                  : row.rank === 3
                    ? "bg-gradient-to-r from-orange-100/70 to-orange-50/30 border-l-4 border-orange-400"
                    : "";
            const totalColor =
              row.rank === 1
                ? "text-amber-900"
                : row.rank === 2
                  ? "text-slate-700"
                  : row.rank === 3
                    ? "text-orange-900"
                    : "text-slate-900";
            return (
              <tr
                key={row.team_id}
                onClick={() => router.push(`/teams/${row.team_id}`)}
                className={`cursor-pointer hover:bg-blue-50/50 transition-colors ${podium}`}
              >
                <td className="px-4 py-3 text-slate-500 font-mono">
                  {medal ? (
                    <span className="text-lg">{medal}</span>
                  ) : (
                    row.rank
                  )}
                </td>
                <td className="px-4 py-3 font-medium">{row.name}</td>
                <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">
                  {row.player_name}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                  {row.stage_points}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                  {row.gc_points}
                </td>
                <td
                  className={`px-4 py-3 text-right tabular-nums font-bold ${totalColor}`}
                >
                  {row.total_points}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
        Click a row to open team details · click a column header to sort.
      </p>
    </div>
  );
}
