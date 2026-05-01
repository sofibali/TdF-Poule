"use client";

// Drop a Word doc (or CSV) of team submissions → server parses it →
// preview parsed teams → confirm → upserts pools/teams/team_riders.
//
// TODO (task #6): wire up the "Confirm import" action that POSTs to
// /api/admin/import to run the upsert. For now this surfaces the parsed
// preview so we can eyeball the parser output.

import { useState } from "react";

import type { ParsedPool } from "@/lib/parsers/types";

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
          Drop the .docx (or .csv) from the in-laws — I&apos;ll parse it,
          you confirm the teams, and the pool is set up.
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
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Preview</h2>
        <div className="text-sm text-slate-500">
          year={parsed.year ?? "?"} · {parsed.team_count} teams
          {parsed.unresolved.length > 0 && (
            <span className="ml-2 text-amber-600">
              · {parsed.unresolved.length} need a name
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {parsed.teams.map((t, i) => (
          <article
            key={i}
            className={`rounded-lg border p-4 ${
              t.needs_attention
                ? "border-amber-300 bg-amber-50"
                : "border-slate-200 bg-white"
            }`}
          >
            <header className="flex items-baseline justify-between">
              <div>
                <div className="font-semibold">
                  {t.player}
                  {t.needs_attention && (
                    <span className="ml-2 text-xs text-amber-700">
                      ⚠ rename me
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500">{t.team_name}</div>
              </div>
              <div className="text-xs text-slate-400">
                {t.riders.length}+{t.reserves.length}
              </div>
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

      <div className="flex justify-end gap-2 pt-4">
        <button
          type="button"
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          onClick={() => alert("TODO: POST to /api/admin/import")}
        >
          Confirm and import
        </button>
      </div>
    </div>
  );
}
