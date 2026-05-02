"use client";

// Drop a Word doc (or CSV) of team submissions → server parses it →
// preview + edit teams (rename Unknown_N) → confirm → POST to /api/admin/import.

import { useState } from "react";

import type { ParsedPool, ParsedTeam } from "@/lib/parsers/types";

export default function AdminUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedPool | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setErr(null);
    setParsed(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/parse", { method: "POST", body: fd });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErr(body.error ?? `Parse failed (${res.status})`);
      return;
    }
    setParsed(await res.json());
  }

  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Upload teams</h1>
        <p className="mt-2 text-sm text-slate-600">
          Drop the .docx (or .csv) from the in-laws — I&apos;ll parse it, you
          fix any teams flagged with ⚠, and confirm to set up the pool.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white p-4"
      >
        <input
          type="file"
          accept=".docx,.csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        <button
          type="submit"
          disabled={!file || busy}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? "Parsing…" : "Parse"}
        </button>
      </form>

      {err && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {err}
        </div>
      )}

      {parsed && <ParsedPreview parsed={parsed} />}
    </section>
  );
}

function ParsedPreview({ parsed }: { parsed: ParsedPool }) {
  // Local editable copy of the teams. Edits bubble up via setTeams; the
  // imported `parsed` object stays unchanged so we can also reset.
  const [teams, setTeams] = useState<ParsedTeam[]>(parsed.teams);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function updateTeam(i: number, patch: Partial<ParsedTeam>) {
    setTeams((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      // Auto-clear needs_attention once they've named the team to something
      // that doesn't start with "Unknown_".
      if (
        patch.player !== undefined &&
        !patch.player.startsWith("Unknown_") &&
        patch.player.trim().length > 0
      ) {
        next[i].needs_attention = false;
      }
      return next;
    });
  }

  async function confirm() {
    setImporting(true);
    setErr(null);
    setResult(null);
    const payload = { ...parsed, teams };
    const res = await fetch("/api/admin/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setImporting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErr(body.error ?? `Import failed (${res.status})`);
      return;
    }
    const body = await res.json();
    setResult(`Imported ${body.teams_imported} teams for ${body.year}.`);
  }

  const unresolvedCount = teams.filter((t) => t.needs_attention).length;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Preview</h2>
        <div className="text-sm text-slate-500">
          year={parsed.year ?? "?"} · {teams.length} teams
          {unresolvedCount > 0 && (
            <span className="ml-2 text-amber-600">
              · {unresolvedCount} still need a name
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {teams.map((t, i) => (
          <article
            key={i}
            className={`rounded-lg border p-4 ${
              t.needs_attention
                ? "border-amber-300 bg-amber-50"
                : "border-slate-200 bg-white"
            }`}
          >
            <header className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={t.player}
                  onChange={(e) => updateTeam(i, { player: e.target.value })}
                  placeholder="Player name"
                  className={`flex-1 rounded border px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-1 ${
                    t.needs_attention
                      ? "border-amber-400 bg-white focus:border-amber-500 focus:ring-amber-300"
                      : "border-transparent bg-transparent hover:border-slate-200 focus:border-slate-400 focus:ring-slate-300 focus:bg-white"
                  }`}
                />
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  {t.riders.length}+{t.reserves.length}
                </span>
              </div>
              <input
                type="text"
                value={t.team_name}
                onChange={(e) => updateTeam(i, { team_name: e.target.value })}
                placeholder="Team name (optional)"
                className="w-full rounded border border-transparent bg-transparent px-2 py-0.5 text-xs text-slate-600 hover:border-slate-200 focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-300"
              />
              {t.needs_attention && (
                <p className="text-xs text-amber-700">
                  ⚠ Type the player&apos;s name above. The flag clears once you
                  rename it.
                </p>
              )}
            </header>
            <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              {t.riders.map((r, j) => (
                <li key={j} className="text-slate-700">
                  {r}
                </li>
              ))}
            </ul>
            {t.reserves.length > 0 && (
              <div className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-500">
                Reserves: {t.reserves.join(" · ")}
              </div>
            )}
          </article>
        ))}
      </div>

      {err && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {err}
        </div>
      )}
      {result && (
        <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {result}{" "}
          <a
            href={`/leaderboard?year=${parsed.year}`}
            className="font-semibold underline"
          >
            View leaderboard →
          </a>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-4">
        {unresolvedCount > 0 && !result && (
          <span className="text-xs text-amber-700">
            You can still import — but unnamed teams will keep the
            &ldquo;Unknown&rdquo; placeholder until you fix them.
          </span>
        )}
        <button
          type="button"
          disabled={importing}
          onClick={confirm}
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {importing ? "Importing…" : "Confirm and import"}
        </button>
      </div>
    </div>
  );
}
