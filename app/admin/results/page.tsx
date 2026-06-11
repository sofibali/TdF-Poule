"use client";

import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Rider = {
  id: string;
  full_name: string;
  pro_team: string | null;
  last_name: string;
};

type TeamRow = {
  id: string;
  name: string;
  player_name: string | null;
  pool_id: string;
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
  team: TeamRow;
};

type Pool = { id: string; year: number };

export default function AdminResultsPage() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
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
      const teamsData = (teamRes.data ?? []) as TeamRow[];
      setTeams(teamsData);
      const teamIds = teamsData.map((t) => t.id);
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
      const teamById = new Map(teamsData.map((t) => [t.id, t]));
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

  function handleTeamRenamed(teamId: string, name: string, playerName: string) {
    setTeams((prev) =>
      prev.map((t) =>
        t.id === teamId ? { ...t, name, player_name: playerName } : t,
      ),
    );
    setPicks((prev) =>
      prev.map((p) =>
        p.team_id === teamId
          ? { ...p, team: { ...p.team, name, player_name: playerName } }
          : p,
      ),
    );
  }

  if (year === null) {
    return (
      <section>
        <h1 className="text-2xl font-bold">Manage teams &amp; picks</h1>
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

  const unknownTeams = teams.filter(
    (t) =>
      !t.player_name ||
      t.player_name.startsWith("Unknown") ||
      t.name.startsWith("Unknown") ||
      t.name === "'s" ||
      !t.player_name.trim(),
  );

  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Manage teams &amp; picks</h1>
        <p className="mt-2 text-sm text-slate-600">
          Rename teams, then resolve ambiguous rider picks below.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
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
      </div>

      {/* ---- TEAMS SECTION ---- */}
      {teams.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">
              Teams ({teams.length})
              {unknownTeams.length > 0 && (
                <span className="ml-2 text-sm font-normal text-amber-600">
                  — {unknownTeams.length} need renaming
                </span>
              )}
            </h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {teams
              .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
              .map((t) => (
                <TeamCard
                  key={t.id}
                  team={t}
                  onRenamed={handleTeamRenamed}
                />
              ))}
          </div>
        </div>
      )}

      {/* ---- PICKS SECTION ---- */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Resolve picks</h2>
          <div className="flex items-center gap-3">
            <select
              value={filter}
              onChange={(e) =>
                setFilter(e.target.value as "unresolved" | "all")
              }
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="unresolved">Show unresolved only</option>
              <option value="all">Show all picks</option>
            </select>
            <div className="text-sm text-slate-500">
              {counts.matched} resolved · {counts.ambiguous} ambiguous ·{" "}
              {counts.unmatched} unmatched
            </div>
          </div>
        </div>

        {loading && (
          <div className="text-sm text-slate-500">Loading picks...</div>
        )}

        <div className="space-y-6">
          {byTeam.map(([teamId, teamPicks]) => {
            const team = teamPicks[0].team;
            return (
              <article
                key={teamId}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <header>
                  <h3 className="font-semibold">{team.name}</h3>
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
                ? "Every pick is resolved!"
                : "No picks for this year yet."}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  TeamCard — inline rename for team name + player name              */
/* ------------------------------------------------------------------ */
function TeamCard({
  team,
  onRenamed,
}: {
  team: TeamRow;
  onRenamed: (id: string, name: string, playerName: string) => void;
}) {
  const needsAttention =
    !team.player_name ||
    !team.player_name.trim() ||
    team.player_name.startsWith("Unknown") ||
    team.name.startsWith("Unknown") ||
    team.name === "'s";

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.name);
  const [playerName, setPlayerName] = useState(team.player_name ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/admin/rename-team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        team_id: team.id,
        name: name.trim(),
        player_name: playerName.trim(),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? "Failed to rename");
      return;
    }
    onRenamed(team.id, name.trim(), playerName.trim());
    setEditing(false);
  }

  if (editing) {
    return (
      <div
        className={`rounded-lg border p-3 space-y-2 ${
          needsAttention
            ? "border-amber-300 bg-amber-50"
            : "border-blue-300 bg-blue-50"
        }`}
      >
        <div>
          <label className="text-[10px] uppercase tracking-wide text-slate-500">
            Player name
          </label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="e.g. Eelco"
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-blue-400"
            autoFocus
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wide text-slate-500">
            Team name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Eelco's Dream Team"
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={save}
            disabled={saving || !name.trim()}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={() => {
              setName(team.name);
              setPlayerName(team.player_name ?? "");
              setEditing(false);
            }}
            className="rounded border border-slate-300 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className={`rounded-lg border p-3 cursor-pointer transition-colors ${
        needsAttention
          ? "border-amber-300 bg-amber-50 hover:bg-amber-100/80"
          : "border-slate-200 bg-white hover:bg-slate-50"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">{team.name}</div>
          <div className="text-xs text-slate-500 truncate">
            {team.player_name || (
              <span className="text-amber-600">No player name</span>
            )}
          </div>
        </div>
        {needsAttention && (
          <span className="shrink-0 text-amber-500 text-xs font-medium">
            Rename
          </span>
        )}
        {!needsAttention && (
          <span className="shrink-0 text-slate-400 text-xs">Edit</span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PickRow — resolve a single ambiguous/unmatched pick               */
/* ------------------------------------------------------------------ */
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
  const isUnresolved =
    pick.match_status === "ambiguous" || pick.match_status === "unmatched";
  const [editing, setEditing] = useState(isUnresolved);

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
      <span className="text-xs text-emerald-700">matched</span>
    ) : pick.match_status === "manual" ? (
      <span className="text-xs text-blue-700">resolved</span>
    ) : pick.match_status === "ambiguous" ? (
      <span className="text-xs text-amber-700">ambiguous</span>
    ) : (
      <span className="text-xs text-rose-700">unmatched</span>
    );

  const currentRider = riders.find((r) => r.id === pick.rider_id);

  function pick_(riderId: string | null) {
    onResolve(riderId);
    setEditing(false);
    setSearch("");
  }

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
                &rarr; {currentRider.full_name}
                {currentRider.pro_team ? ` · ${currentRider.pro_team}` : ""}
              </span>
            )}
            {!currentRider && pick.match_status === "manual" && (
              <span className="ml-2 text-xs text-slate-500">
                &rarr; didn&apos;t start
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="text-xs text-slate-500 hover:text-blue-600 hover:underline shrink-0"
        >
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>

      {editing && (
        <div className="mt-3 space-y-2">
          {candidates.length > 0 && (
            <div>
              <div className="text-xs text-slate-500 mb-1">
                Suggested matches:
              </div>
              <div className="flex flex-wrap gap-1">
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => pick_(c.id)}
                    className={`rounded border px-2 py-1 text-xs hover:bg-blue-50 hover:border-blue-300 ${
                      pick.rider_id === c.id
                        ? "border-blue-400 bg-blue-50 font-semibold"
                        : "border-slate-300 bg-slate-50"
                    }`}
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
              placeholder="Search any rider by name or team..."
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
              autoFocus={isUnresolved}
            />
            {searchResults.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {searchResults.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => pick_(r.id)}
                    className={`rounded border px-2 py-1 text-xs hover:bg-blue-50 hover:border-blue-300 ${
                      pick.rider_id === r.id
                        ? "border-blue-400 bg-blue-50 font-semibold"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    {r.full_name}
                    {r.pro_team && (
                      <span className="ml-1 text-slate-500">
                        · {r.pro_team}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-xs">
            <button
              onClick={() => pick_(null)}
              className="text-slate-500 hover:text-rose-600 hover:underline"
            >
              Mark as &ldquo;didn&apos;t start&rdquo;
            </button>
            {currentRider && (
              <span className="text-slate-400">
                Currently: <strong>{currentRider.full_name}</strong>
              </span>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
