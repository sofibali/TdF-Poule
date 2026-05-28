"use client";

// Manual on-demand refresh for any year. Lists the years we have pools for
// and gives each a "Refresh" button that hits /api/refresh and shows the
// summary. Useful for back-filling historical years (2020-2025) since the
// daily cron only refreshes the active year (TDF_YEAR env var).

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type RefreshSummary = {
  pool_id: string;
  year: number;
  stages_fetched: number[];
  gc_fetched: boolean;
  riders_seeded: number;
  picks_resolved: number;
  picks_ambiguous: number;
  picks_unmatched: number;
  errors: string[];
};

export default function AdminRefreshPage() {
  const [years, setYears] = useState<number[]>([]);
  const [busyYear, setBusyYear] = useState<number | null>(null);
  const [results, setResults] = useState<Record<number, RefreshSummary | string>>({});

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("pools")
      .select("year")
      .order("year", { ascending: false })
      .then(({ data }) => {
        setYears((data ?? []).map((p) => p.year as number));
      });
  }, []);

  async function refresh(year: number) {
    setBusyYear(year);
    setResults((prev) => ({ ...prev, [year]: "Fetching from PCS — this can take ~30s for a full year..." }));
    try {
      const res = await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year }),
      });
      const body = await res.json();
      if (!res.ok) {
        setResults((prev) => ({
          ...prev,
          [year]: body.error ?? `Failed (${res.status})`,
        }));
      } else {
        setResults((prev) => ({ ...prev, [year]: body as RefreshSummary }));
      }
    } catch (e) {
      setResults((prev) => ({
        ...prev,
        [year]: e instanceof Error ? e.message : String(e),
      }));
    }
    setBusyYear(null);
  }

  async function refreshAll() {
    for (const y of years) {
      // eslint-disable-next-line no-await-in-loop
      await refresh(y);
    }
  }

  return (
    <section className="space-y-8">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Refresh results</h1>
          <p className="mt-2 text-sm text-slate-600">
            Pull stage results + final GC from ProCyclingStats. The daily cron
            handles the active year automatically; use this to back-fill
            previous years or force a fresh pull mid-stage.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          disabled={busyYear !== null}
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 whitespace-nowrap"
        >
          {busyYear !== null
            ? `Refreshing ${busyYear}…`
            : `Refresh all ${years.length} years`}
        </button>
      </div>

      <details className="rounded border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-700">
          What do the result terms mean?
        </summary>
        <dl className="mt-2 space-y-2">
          <div>
            <dt className="font-semibold text-slate-800">Stages fetched</dt>
            <dd>
              Number of new stage result pages pulled from PCS this run. 0
              means everything was already cached.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-800">GC ✓ / pending</dt>
            <dd>
              Whether the final General Classification (overall standings)
              has been fetched. Only fires after stage 21 finishes.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-800">Riders seeded</dt>
            <dd>
              Canonical rider rows in the database for that year. The 184-ish
              starters in the Tour become one row each.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-emerald-700">
              Picks resolved (matched)
            </dt>
            <dd>
              Team picks the auto-matcher confidently linked to a canonical
              rider. These score points immediately.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-amber-700">Ambiguous</dt>
            <dd>
              Multiple riders share that last name (e.g.
              <em> &ldquo;Yates&rdquo;</em> could be Adam or Simon). You pick
              which one on{" "}
              <a className="underline" href="/admin/results">
                Resolve picks
              </a>
              .
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-rose-700">Unmatched</dt>
            <dd>
              No rider on the start list matches the typed name. Usually a
              typo in the docx (e.g. <em>&ldquo;Skjlemose&rdquo;</em> instead
              of <em>Skjelmose</em>) or a rider who didn&apos;t race. Fix on{" "}
              <a className="underline" href="/admin/results">
                Resolve picks
              </a>{" "}
              or mark &ldquo;didn&apos;t start&rdquo; — a reserve fills in
              automatically for stages 1–6.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-800">
              &ldquo;Could not find function in the schema cache&rdquo; warning
            </dt>
            <dd>
              PostgREST hasn&apos;t picked up a recently-added SQL function
              yet. Usually clears itself within a minute; otherwise paste{" "}
              <code className="bg-slate-200 px-1 rounded">
                notify pgrst, &apos;reload schema&apos;;
              </code>{" "}
              in Supabase SQL Editor.
            </dd>
          </div>
        </dl>
      </details>

      <ul className="space-y-3">
        {years.map((year) => {
          const r = results[year];
          return (
            <li
              key={year}
              className="rounded-lg border border-slate-200 bg-white p-4"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold">
                    Tour de France {year}
                  </div>
                  {typeof r === "object" && r !== null && (
                    <div className="mt-1 space-y-0.5 text-xs text-slate-500">
                      <div>
                        {r.stages_fetched.length} stages fetched ·{" "}
                        {r.gc_fetched ? "GC ✓" : "GC pending"} ·{" "}
                        {r.riders_seeded > 0
                          ? `${r.riders_seeded} riders seeded`
                          : "riders already loaded"}
                      </div>
                      <div>
                        Picks resolved: {r.picks_resolved}
                        {r.picks_ambiguous > 0 && (
                          <span className="ml-2 text-amber-600">
                            · {r.picks_ambiguous} ambiguous (need manual fix)
                          </span>
                        )}
                        {r.picks_unmatched > 0 && (
                          <span className="ml-2 text-rose-600">
                            · {r.picks_unmatched} unmatched
                          </span>
                        )}
                      </div>
                      {r.errors.length > 0 && (
                        <div className="text-amber-600">
                          {r.errors.length} warning(s)
                        </div>
                      )}
                    </div>
                  )}
                  {typeof r === "string" && (
                    <div className="mt-1 text-xs text-slate-500">{r}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => refresh(year)}
                  disabled={busyYear !== null}
                  className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {busyYear === year ? "Fetching…" : "Refresh"}
                </button>
              </div>

              {typeof r === "object" && r !== null && r.errors.length > 0 && (
                <details className="mt-3 text-xs">
                  <summary className="cursor-pointer text-amber-700">
                    Show {r.errors.length} warning(s)
                  </summary>
                  <ul className="mt-2 list-disc pl-5 space-y-0.5 text-slate-600">
                    {r.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-slate-400">
        A full year fetch hits PCS 21 times (one per stage) plus the start
        list and final GC, with small delays between requests. Expect ~30
        seconds total per year.
      </p>
    </section>
  );
}
