// One team's detail — rider list with each rider's points, dropout status,
// reserve substitutions, plus a stage-by-stage breakdown row.

import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { computePickEvents, type RiderDropout } from "@/lib/scoring/substitutions";
import type { TeamRider } from "@/lib/db/types";

export const dynamic = "force-dynamic";

export default async function TeamDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const { data: team } = await supabase
    .from("teams")
    .select("id, name, player_name, pool_id")
    .eq("id", params.id)
    .single();
  if (!team) notFound();

  const { data: pool } = await supabase
    .from("pools")
    .select("year, num_stages")
    .eq("id", team.pool_id)
    .single();

  const [{ data: picks }, { data: dropouts }, { data: stagePts }, { data: riderPts }, { data: riders }] =
    await Promise.all([
      supabase
        .from("team_riders")
        .select(
          "id, team_id, rider_id, raw_name, is_reserve, reserve_order, pick_order, match_status",
        )
        .eq("team_id", params.id),
      supabase
        .from("rider_dropouts")
        .select("rider_id, dropout_after_stage")
        .eq("pool_id", team.pool_id),
      supabase
        .from("v_team_stage_points")
        .select("stage, points")
        .eq("team_id", params.id)
        .order("stage"),
      // Per-rider points for this team — joined client-side below.
      supabase
        .from("v_rider_stage_points")
        .select("rider_id, rider_name, points")
        .eq("pool_id", team.pool_id),
      // Canonical riders for the year — used to resolve pcs_slug + pro_team
      // + bib_number on each pick when we render the roster.
      supabase
        .from("riders")
        .select("id, full_name, last_name, pcs_slug, pro_team, bib_number")
        .eq("pool_id", team.pool_id),
    ]);

  type RiderMeta = {
    pcs_slug: string | null;
    pro_team: string | null;
    bib_number: number | null;
  };
  const ridersById = new Map<string, RiderMeta>();
  const ridersByLast = new Map<string, RiderMeta>();
  for (const r of riders ?? []) {
    const meta: RiderMeta = {
      pcs_slug: r.pcs_slug,
      pro_team: r.pro_team,
      bib_number: r.bib_number,
    };
    ridersById.set(r.id, meta);
    if (r.last_name) ridersByLast.set(r.last_name.toLowerCase(), meta);
  }
  function metaFor(rider_id: string | null, raw_name: string): RiderMeta {
    if (rider_id && ridersById.has(rider_id)) return ridersById.get(rider_id)!;
    const last = raw_name.toLowerCase().split(/\s+/).pop() ?? "";
    return ridersByLast.get(last) ?? { pcs_slug: null, pro_team: null, bib_number: null };
  }

  const events = computePickEvents(
    (picks as TeamRider[]) ?? [],
    (dropouts as RiderDropout[]) ?? [],
  );

  // Sum points by raw_name (best-effort match against rider_name in the view).
  const ptsByName = new Map<string, number>();
  for (const r of riderPts ?? []) {
    const k = (r.rider_name ?? "").toLowerCase();
    ptsByName.set(k, (ptsByName.get(k) ?? 0) + (r.points ?? 0));
  }
  function ptsFor(raw: string): number {
    const k = raw.toLowerCase();
    if (ptsByName.has(k)) return ptsByName.get(k) ?? 0;
    // last-name fallback
    const last = k.split(/\s+/).pop() ?? k;
    let total = 0;
    for (const [name, pts] of ptsByName) {
      if (name.endsWith(last) || name.includes(last)) total += pts;
    }
    return total;
  }

  const stageRows = stagePts ?? [];
  const main = events.filter((e) => e.kind === "main");
  const reserves = events.filter((e) => e.kind === "reserve");

  return (
    <section className="space-y-8">
      <div>
        <Link
          href="/leaderboard"
          className="text-sm text-slate-500 hover:underline"
        >
          ← Leaderboard
        </Link>
        <h1 className="mt-2 text-3xl font-bold">{team.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {team.player_name} · Tour de France {pool?.year}
        </p>
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Roster
        </h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {main.map((e) => {
            if (e.kind !== "main") return null;
            const points = ptsFor(e.raw_name);
            // Look up rider meta — prefer the resolved rider_id from the pick.
            const pickRow = (picks ?? []).find((p) => p.id === e.team_rider_id);
            const meta = metaFor(pickRow?.rider_id ?? null, e.raw_name);
            return (
              <li
                key={e.team_rider_id}
                className={`flex items-start justify-between rounded border px-3 py-2 text-sm ${
                  e.status === "active"
                    ? "border-slate-200 bg-white"
                    : e.status === "dropped_out"
                      ? "border-rose-200 bg-rose-50/50"
                      : "border-slate-200 bg-slate-50 text-slate-500"
                }`}
              >
                <div>
                  <div className="font-medium text-slate-800">
                    {meta.pcs_slug ? (
                      <a
                        href={`https://www.procyclingstats.com/rider/${meta.pcs_slug}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="hover:text-blue-600 hover:underline"
                      >
                        {e.raw_name}
                      </a>
                    ) : (
                      e.raw_name
                    )}
                    {meta.bib_number != null && (
                      <span className="ml-2 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-500">
                        #{meta.bib_number}
                      </span>
                    )}
                  </div>
                  {meta.pro_team && (
                    <div className="text-xs text-slate-400">{meta.pro_team}</div>
                  )}
                  <div className="mt-0.5 text-xs">
                    {e.status === "active" && (
                      <span className="text-emerald-700">● Active</span>
                    )}
                    {e.status === "dropped_out" && (
                      <span className="text-rose-700">
                        ✗ Dropped out after stage {e.dropout_after_stage}
                      </span>
                    )}
                    {e.status === "didnt_start" && (
                      <span className="text-slate-500">— Didn&apos;t start</span>
                    )}
                  </div>
                </div>
                <span className="tabular-nums text-slate-500">
                  {points || "—"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {reserves.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Reserves
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {reserves.map((e) => {
              if (e.kind !== "reserve") return null;
              const pickRow = (picks ?? []).find((p) => p.id === e.team_rider_id);
              const meta = metaFor(pickRow?.rider_id ?? null, e.raw_name);
              return (
                <li
                  key={e.team_rider_id}
                  className={`flex items-start justify-between rounded border px-3 py-2 text-sm ${
                    e.status === "used"
                      ? "border-blue-200 bg-blue-50/60"
                      : e.status === "didnt_start"
                        ? "border-slate-200 bg-slate-50 text-slate-500"
                        : "border-slate-200 bg-white"
                  }`}
                >
                  <div>
                    <div className="font-medium text-slate-800">
                      <span className="text-slate-400 mr-1">{e.reserve_order}.</span>
                      {meta.pcs_slug ? (
                        <a
                          href={`https://www.procyclingstats.com/rider/${meta.pcs_slug}`}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="hover:text-blue-600 hover:underline"
                        >
                          {e.raw_name}
                        </a>
                      ) : (
                        e.raw_name
                      )}
                      {meta.bib_number != null && (
                        <span className="ml-2 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-500">
                          #{meta.bib_number}
                        </span>
                      )}
                    </div>
                    {meta.pro_team && (
                      <div className="text-xs text-slate-400">{meta.pro_team}</div>
                    )}
                    <div className="mt-0.5 text-xs">
                      {e.status === "used" && (
                        <span className="text-blue-700">
                          → Joined at stage {e.joined_at_stage}
                          {e.replaced_raw_name && (
                            <> · replacing {e.replaced_raw_name}</>
                          )}
                        </span>
                      )}
                      {e.status === "unused" && (
                        <span className="text-slate-500">Unused</span>
                      )}
                      {e.status === "didnt_start" && (
                        <span className="text-slate-500">
                          — Didn&apos;t start
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Points by stage
        </h2>
        <div className="mt-3 overflow-x-auto rounded border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {stageRows.map((s) => (
                  <th key={s.stage} className="px-2 py-2 font-mono">
                    {s.stage}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {stageRows.map((s) => (
                  <td
                    key={s.stage}
                    className={`px-2 py-2 text-center tabular-nums ${
                      s.points > 0 ? "font-semibold text-slate-900" : "text-slate-400"
                    }`}
                  >
                    {s.points || "—"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
