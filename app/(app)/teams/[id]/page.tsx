import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { computePickEvents, type RiderDropout } from "@/lib/scoring/substitutions";
import RiderCardLink from "@/components/RiderCardLink";
import type { TeamRider } from "@/lib/db/types";

export const dynamic = "force-dynamic";

function RiderCountBadge({ count, total }: { count: number; total: number }) {
  const pct = count / total;
  const cls =
    count === 1
      ? "bg-emerald-100 text-emerald-700"
      : pct <= 0.25
        ? "bg-amber-100 text-amber-700"
        : "bg-slate-100 text-slate-500";
  const label = count === 1 ? "unique" : `${count}/${total}`;
  return (
    <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${cls}`}>
      {label}
    </span>
  );
}

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
    .select("year, num_stages, reserve_lock_stage")
    .eq("id", team.pool_id)
    .single();

  const [{ data: picks }, { data: dropouts }, { data: stagePts }, { data: riderPts }, { data: riders }, { data: poolTeams }] =
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
      supabase
        .from("v_rider_stage_points")
        .select("rider_id, rider_name, points")
        .eq("pool_id", team.pool_id),
      supabase
        .from("riders")
        .select("id, full_name, last_name, pcs_slug, pro_team, bib_number")
        .eq("pool_id", team.pool_id),
      supabase
        .from("teams")
        .select("id")
        .eq("pool_id", team.pool_id),
    ]);

  // Rider popularity: count how many teams in this pool picked each rider.
  const poolTeamIds = (poolTeams ?? []).map((t) => t.id);
  const totalTeams = poolTeamIds.length;
  const riderTeamCount = new Map<string, number>(); // rider_id → # teams
  const rawNameTeamCount = new Map<string, number>(); // lower(raw_name) → # teams
  if (poolTeamIds.length > 0) {
    const { data: allPicks } = await supabase
      .from("team_riders")
      .select("rider_id, raw_name")
      .in("team_id", poolTeamIds);
    for (const p of allPicks ?? []) {
      if (p.rider_id) riderTeamCount.set(p.rider_id, (riderTeamCount.get(p.rider_id) ?? 0) + 1);
      const k = (p.raw_name ?? "").toLowerCase().trim();
      if (k) rawNameTeamCount.set(k, (rawNameTeamCount.get(k) ?? 0) + 1);
    }
  }
  function teamCountFor(rider_id: string | null, raw_name: string): number {
    if (rider_id && riderTeamCount.has(rider_id)) return riderTeamCount.get(rider_id)!;
    return rawNameTeamCount.get(raw_name.toLowerCase().trim()) ?? 0;
  }

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
    pool?.reserve_lock_stage ?? 6,
  );

  const ptsByName = new Map<string, number>();
  for (const r of riderPts ?? []) {
    const k = (r.rider_name ?? "").toLowerCase();
    ptsByName.set(k, (ptsByName.get(k) ?? 0) + (r.points ?? 0));
  }
  function ptsFor(raw: string): number {
    const k = raw.toLowerCase();
    if (ptsByName.has(k)) return ptsByName.get(k) ?? 0;
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
  const totalPoints = stageRows.reduce((sum, s) => sum + s.points, 0);

  return (
    <section className="space-y-8">
      <div>
        <Link
          href="/leaderboard"
          className="inline-flex items-center gap-1 text-sm text-amber-700/60 hover:text-amber-800 hover:underline transition-colors"
        >
          ← Back to leaderboard
        </Link>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">{team.name}</h1>
            <p className="mt-1 text-sm text-amber-800/60">
              {team.player_name} · Tour de France {pool?.year}
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-3xl font-extrabold tabular-nums text-amber-700">{totalPoints}</div>
            <div className="text-[10px] uppercase tracking-widest text-amber-700/50">total pts</div>
          </div>
        </div>
      </div>

      {/* Roster */}
      <div>
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          <span>🚴</span> Roster
        </h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {main.map((e) => {
            if (e.kind !== "main") return null;
            const points = ptsFor(e.raw_name);
            const pickRow = (picks ?? []).find((p) => p.id === e.team_rider_id);
            const meta = metaFor(pickRow?.rider_id ?? null, e.raw_name);
            const count = teamCountFor(pickRow?.rider_id ?? null, e.raw_name);
            const pcsUrl = meta.pcs_slug
              ? `https://www.letour.fr/en/rider/${meta.pcs_slug}`
              : null;
            const statusCls =
              e.status === "active"
                ? "border-emerald-200 bg-white/90"
                : e.status === "dropped_out"
                  ? "border-rose-200 bg-rose-50/50"
                  : "border-slate-200 bg-slate-50/50 text-slate-400";
            const cardCls = `flex items-start justify-between rounded-xl border px-4 py-3 text-sm transition-all ${statusCls}`;
            const inner = (
              <>
                <div>
                  <div className="font-semibold text-slate-800 flex items-center flex-wrap gap-x-1.5 gap-y-0.5">
                    <span>{e.raw_name}</span>
                    {pcsUrl && (
                      <svg className="w-3 h-3 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    )}
                    {meta.bib_number != null && (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-500">
                        #{meta.bib_number}
                      </span>
                    )}
                    {count > 0 && totalTeams > 1 && (
                      <RiderCountBadge count={count} total={totalTeams} />
                    )}
                  </div>
                  {meta.pro_team && (
                    <div className="text-xs text-slate-400">{meta.pro_team}</div>
                  )}
                  <div className="mt-1 text-xs">
                    {e.status === "active" && <span className="text-emerald-600">● Active</span>}
                    {e.status === "dropped_out" && (
                      <span className="text-rose-600">✗ Out after stage {e.dropout_after_stage}</span>
                    )}
                    {e.status === "didnt_start" && <span className="text-slate-400">— DNS</span>}
                  </div>
                </div>
                <span className={`tabular-nums font-bold shrink-0 ml-2 ${points ? "text-slate-900" : "text-slate-300"}`}>
                  {points || "—"}
                </span>
              </>
            );
            return (
              <RiderCardLink
                key={e.team_rider_id}
                href={pcsUrl}
                name={e.raw_name}
                className={pcsUrl ? `${cardCls} cursor-pointer select-none active:scale-[0.97] active:opacity-90 hover:shadow-sm` : cardCls}
              >
                {inner}
              </RiderCardLink>
            );
          })}
        </div>
      </div>

      {/* Reserves */}
      {reserves.length > 0 && (
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
            <span>🔄</span> Reserves
          </h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {reserves.map((e) => {
              if (e.kind !== "reserve") return null;
              const pickRow = (picks ?? []).find((p) => p.id === e.team_rider_id);
              const meta = metaFor(pickRow?.rider_id ?? null, e.raw_name);
              const count = teamCountFor(pickRow?.rider_id ?? null, e.raw_name);
              const pcsUrl = meta.pcs_slug
              ? `https://www.letour.fr/en/rider/${meta.pcs_slug}`
              : null;
              const statusCls =
                e.status === "used"
                  ? "border-blue-200 bg-blue-50/50"
                  : e.status === "didnt_start"
                    ? "border-slate-200 bg-slate-50/50 text-slate-400"
                    : "border-slate-200 bg-white/80";
              const cardCls = `flex items-start justify-between rounded-xl border px-4 py-3 text-sm ${statusCls}`;
              return (
                <RiderCardLink
                  key={e.team_rider_id}
                  href={pcsUrl}
                  name={e.raw_name}
                  className={pcsUrl ? `${cardCls} cursor-pointer select-none active:scale-[0.97] active:opacity-90` : cardCls}
                >
                  <div className="font-semibold text-slate-800 flex items-center flex-wrap gap-x-1.5 gap-y-0.5">
                    <span className="text-slate-400 mr-0.5">{e.reserve_order}.</span>
                    <span>{e.raw_name}</span>
                    {pcsUrl && (
                      <svg className="w-3 h-3 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    )}
                    {count > 0 && totalTeams > 1 && (
                      <RiderCountBadge count={count} total={totalTeams} />
                    )}
                  </div>
                  {meta.pro_team && (
                    <div className="text-xs text-slate-400">{meta.pro_team}</div>
                  )}
                  <div className="mt-1 text-xs">
                    {e.status === "used" && (
                      <span className="text-blue-600">
                        → Subbed in at stage {e.joined_at_stage}
                        {e.replaced_raw_name && <> for {e.replaced_raw_name}</>}
                      </span>
                    )}
                    {e.status === "unused" && <span className="text-slate-400">Bench</span>}
                    {e.status === "didnt_start" && <span className="text-slate-400">— DNS</span>}
                  </div>
                </RiderCardLink>
              );
            })}
          </div>
        </div>
      )}

      {/* Stage breakdown */}
      {stageRows.length > 0 && (
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
            <span>📊</span> Points by stage
          </h2>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-amber-200/60 bg-white/90">
            <table className="w-full text-sm">
              <thead className="bg-amber-50/80 text-xs text-amber-800/60">
                <tr>
                  <th className="px-3 py-2 text-left font-bold uppercase tracking-wide text-amber-800/70">
                    Total
                  </th>
                  {stageRows.map((s) => (
                    <th key={s.stage} className="px-2 py-2 font-mono">
                      {s.stage}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-3 py-2 text-left tabular-nums font-extrabold text-amber-700">
                    {totalPoints}
                  </td>
                  {stageRows.map((s) => (
                    <td
                      key={s.stage}
                      className={`px-2 py-2 text-center tabular-nums ${
                        s.points > 0 ? "font-bold text-slate-900" : "text-slate-300"
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
      )}
    </section>
  );
}
