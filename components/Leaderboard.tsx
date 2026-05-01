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
      const { data } = await supabase
        .from("v_leaderboard")
        .select("*")
        .eq("year", year)
        .order("rank", { ascending: true });
      if (data) setRows(data as LeaderboardRow[]);
    }

    const channel = supabase
      .channel("leaderboard")
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
            return (
              <tr
                key={row.team_id}
                onClick={() => router.push(`/teams/${row.team_id}`)}
                className={`cursor-pointer hover:bg-blue-50/40 ${
                  row.rank === 1
                    ? "bg-yellow-50/50"
                    : row.rank <= 3
                      ? "bg-slate-50/50"
                      : ""
                }`}
              >
                <td className="px-4 py-3 text-slate-500 font-mono">
                  {medal || row.rank}
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
                <td className="px-4 py-3 text-right tabular-nums font-bold">
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
