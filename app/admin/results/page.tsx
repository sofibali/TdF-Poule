"use client";

// Resolve ambiguous and unmatched team picks. Lists every team_rider in
// the chosen year whose match_status isn't 'matched' or 'manual', and lets
// you pick the right canonical rider from a dropdown — with the matcher's
// candidate shortlist surfaced first, and a free-text search for the rest.

import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Rider = {
  id: string;
  full_name: string;
  pro_team: string | null;
  last_name: string;
};

type Pick = {
  id: string;
  team_id: string;
  raw_name: string;
  is_reserve: boolean;
  reserve_order: number | null;
  pick_order: number | null;
  match_status: "matched" | "ambiguous" | "unmatched" | "manual";
  match_candidates:
    | Array<{ rider_id: string; full_name: string; pro_team?: string | null }>
    | null;
  rider_id: string | null;
  team: { name: string; player_name: string | null; pool_id: string };
};

type Pool = { id: string; year: number };

export default function AdminResultsPage() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"unresolved" | "all">("unresolved");

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("pools")
      .select("id, year")
      .order("year", { ascending: false })
      .then(({ data }) => {
        const list = (data ?? []) as Pool[];
        setPools(list);
        if (list.length > 0 && year === null) setYear(list[0].year);
      });
  }, [year]);

  useEffect(() => {
    if (year === null) return;
    setLoading(true);
    const supabase = createClient();
    const pool = pools.find((p) => p.year === year);
    if (!pool) {
      setLoading(false);
      return;
    }
    Promise.all([
      supabase
        .from("riders")
        .select("id, full_name, pro_team, last_name")
        .eq("pool_id", pool.id)
        .order("last_name"),
      supabase
        .from("teams")
        .select("id, name, player_name, pool_id")
        .eq("pool_id", pool.id),
    ]).then(async ([riderRes, teamRes]) => {
      const ridersData = (riderRes.data ?? []) as Rider[];
      const teams = teamRes.data ?? [];
      const teamIds = teams.map((t) => t.id);
      if (teamIds.length === 0) {
        setRiders(ridersData);
        setPicks([]);
        setLoading(false);
        return;
      }
      const { data: pickRows } = await supabase
        .from("team_riders")
        .select(
          "id, team_id, raw_name, is_reserve, reserve_order, pick_order, match_status, match_candidates, rider_id",
        )
        .in("team_id", teamIds);
      const teamById = new Map(teams.map((t) => [t.id, t]));
      const enriched: Pick[] = (pickRows ?? []).map((p) => ({
        ...p,
        team: teamById.get(p.team_id) as Pick["team"],
      }));
      setRiders(ridersData);
      setPicks(enriched);
      setLoading(false);
    });
  }, [year, pools]);

  const visiblePicks = useMemo(() => {
    if (filter === "all") return picks;
    return picks.filter(
      (p) => p.match_status === "ambiguous" || p.match_status === "unmatched",
    );
  }, [picks, filter]);

  const byTeam = useMemo(() => {
    const m = new Map<string, Pick[]>();
    for (const p of visiblePicks) {
      const arr = m.get(p.team_id) ?? [];
      arr.push(p);
      m.set(p.team_id, arr);
    }
    return [...m.entries()].sort((a, b) => {
      const an = a[1][0]?.team.name ?? "";
      const bn = b[1][0]?.team.name ?? "";
      return an.localeCompare(bn);
    });
  }, [visiblePicks]);

  async function resolve(pickId: string, riderId: string | null) {
    const res = await fetch("/api/admin/resolve-pick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_rider_id: pickId, rider_id: riderId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? "Failed to update");
      return;
    }
    setPicks((prev) =>
      prev.map((p) =>
        p.id === pickId
          ? { ...p, rider_id: riderId, match_status: "manual" }
          : p,
      ),
    );
  }

  if (year === null) {
    return (
      <section>
        <h1 className="text-2xl font-bold">Resolve picks</h1>
        <p className="mt-2 text-sm text-slate-500">No pools yet.</p>
      </section>
    );
  }

  const counts = {
    ambiguous: picks.filter((p) => p.match_status === "ambiguous").length,
    unmatched: picks.filter((p) => p.match_status === "unmatched").length,
    matched: picks.filter(
      (p) => p.match_status === "matched" || p.match_status === "manual",
    ).length,
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Resolve picks</h1>
        <p className="mt-2 text-sm text-slate-600">
          Pick the canonical rider for any team_rider that the auto-matcher
          couldn&apos;t resolve. Once you pick, the team starts scoring those
          points.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-600">Year</label>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm"
          >
            {pools.map((p) => (
              <option key={p.year} value={p.year}>
                {p.year}
              </option>
            ))}
          </select>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as "unresolved" | "all")}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm"
          >
            <option value="unresolved">Show unresolved only</option>
            <option value="all">Show all picks</option>
          </select>
        </div>
        <div className="text-sm text-slate-500">
          ✓ {counts.matched} resolved · ⚠ {counts.ambiguous} ambiguous · ✗{" "}
          {counts.unmatched} unmatched
        </div>
      </div>

      {loading && <div className="text-sm text-slate-500">Loading picks…</div>}

      <div className="space-y-6">
        {byTeam.map(([teamId, teamPicks]) => {
          const team = teamPicks[0].team;
          return (
            <article
              key={teamId}
              className="rounded-lg border border-slate-200 bg-white p-4"
            >
              <header>
                <h2 className="font-semibold">{team.name}</h2>
                <p className="text-xs text-slate-500">{team.player_name}</p>
              </header>
              <ul className="mt-4 space-y-3">
                {teamPicks
                  .sort(
                    (a, b) =>
                      Number(a.is_reserve) - Number(b.is_reserve) ||
                      (a.pick_order ?? 99) - (b.pick_order ?? 99) ||
                      (a.reserve_order ?? 99) - (b.reserve_order ?? 99),
                  )
                  .map((p) => (
                    <PickRow
                      key={p.id}
                      pick={p}
                      riders={riders}
                      onResolve={(riderId) => resolve(p.id, riderId)}
                    />
                  ))}
              </ul>
            </article>
          );
        })}
        {byTeam.length === 0 && !loading && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            {filter === "unresolved"
              ? "🎉 Every pick is resolved!"
              : "No picks for this year yet."}
          </div>
        )}
      </div>
    </section>
  );
}

function PickRow({
  pick,
  riders,
  onResolve,
}: {
  pick: Pick;
  riders: Rider[];
  onResolve: (riderId: string | null) => void;
}) {
  const [search, setSearch] = useState("");

  const candidateIds = new Set(
    (pick.match_candidates ?? []).map((c) => c.rider_id),
  );
  const candidates = riders.filter((r) => candidateIds.has(r.id));

  const searchResults = useMemo(() => {
    if (search.trim().length < 2) return [];
    const q = search.toLowerCase();
    return riders
      .filter(
        (r) =>
          r.full_name.toLowerCase().includes(q) ||
          (r.pro_team ?? "").toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [search, riders]);

  const statusBadge =
    pick.match_status === "matched" ? (
      <span className="text-xs text-emerald-700">✓ matched</span>
    ) : pick.match_status === "manual" ? (
      <span className="text-xs text-blue-700">✓ resolved manually</span>
    ) : pick.match_status === "ambiguous" ? (
      <span className="text-xs text-amber-700">⚠ ambiguous</span>
    ) : (
      <span className="text-xs text-rose-700">✗ unmatched</span>
    );

  const currentRider = riders.find((r) => r.id === pick.rider_id);
  const isUnresolved =
    pick.match_status === "ambiguous" || pick.match_status === "unmatched";

  return (
    <li className="rounded border border-slate-200 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-sm font-medium">
            {pick.is_reserve ? `Reserve #${pick.reserve_order}` : "Main pick"}
            {": "}
            <span className="text-slate-700">{pick.raw_name}</span>
          </div>
          <div className="mt-0.5">
            {statusBadge}
            {currentRider && (
              <span className="ml-2 text-xs text-slate-500">
                → {currentRider.full_name}
                {currentRider.pro_team ? ` · ${currentRider.pro_team}` : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {isUnresolved && (
        <div className="mt-3 space-y-2">
          {candidates.length > 0 && (
            <div>
              <div className="text-xs text-slate-500 mb-1">
                Suggested from matcher:
              </div>
              <div className="flex flex-wrap gap-1">
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onResolve(c.id)}
                    className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs hover:bg-blue-50 hover:border-blue-300"
                  >
                    {c.full_name}
                    {c.pro_team && (
                      <span className="ml-1 text-slate-500">
                        · {c.pro_team}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search any rider…"
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
            {searchResults.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {searchResults.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      onResolve(r.id);
                      setSearch("");
                    }}
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-blue-50 hover:border-blue-300"
                  >
                    {r.full_name}
                    {r.pro_team && (
                      <span className="ml-1 text-slate-500">· {r.pro_team}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="text-right">
            <button
              onClick={() => onResolve(null)}
              className="text-xs text-slate-500 hover:text-rose-600 hover:underline"
            >
              Mark as &ldquo;rider didn&apos;t start&rdquo; (no match)
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
