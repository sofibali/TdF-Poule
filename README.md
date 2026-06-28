# TdF-Poule — family Tour de France pool

A hosted web app for the family Tour de France "poule" (running since 1991).
Players draft riders into teams (15 mains + 3 reserves); the app scores them from
the real race results — stage placings, final GC, reserve substitutions, and
per-year rule tweaks. Public read-only leaderboard; admin-only data management.

## Stack

- **Next.js 14** (App Router, Server Components) + **TypeScript** + **Tailwind**
- **Supabase** (Postgres + magic-link auth + RLS)
- **Vercel** hosting + daily Cron
- **cheerio** for HTML parsing

## How scoring works

All scoring is in SQL (`supabase/migrations/`), read by the leaderboard views:

- **Stage points** — top-10 of each stage: 20/15/12/10/8/6/5/4/3/2, to each of a
  team's active riders.
- **Final GC** — top-10: 100/80/60/40/30/25/20/18/16/15, to the team's final
  roster (surviving mains + any subbed-in reserves).
- **Reserve substitution** — if a main doesn't finish stage `reserve_lock_stage`
  (default 6), the next available reserve takes over from the drop stage to the
  end and earns GC too.
- **Per-year rules** (`pools` columns) — e.g. 2026: `reserve_lock_stage = 10`,
  and a `youth_bonus_points = 4` to the best-placed young rider in each stage.

See the [scoring-correctness] notes in project memory for the full model. Points
tables and reserve rules are taken from the pool's Word doc each year.

## Data sources

**ProCyclingStats is unusable** (Cloudflare blocks the app, Vercel, and local).

- **letour.fr** — the live source for the current edition (`lib/scraper/letour.ts`):
  GC, per-stage results, withdrawals, and all four jersey classifications.
- **cyclingstage.com** — per-year withdrawal lists → rider dropouts.
- **bikeraceinfo.com** / **Wikipedia** — historical stage results and authoritative GC.

Historical pool teams are seeded from the in-laws' Word/CSV/PDF files in
`historical-inputs/` (2020–2025 have teams; 2000–2019 are a race-result archive).

## Layout

```
app/
  (app)/        public pages — leaderboard, riders, matrix, teams/[id]
  admin/        authed — upload, results, refresh
  api/          cron/fetch-results, refresh (both use the live letour scraper)
lib/
  scraper/      letour.ts (live), live-refresh.ts, pcs.ts (legacy), bikeraceinfo helpers
  scoring/      canonical-match.ts (rider matcher) + name-corrections.json
  supabase/     client factories
  data/         champions.ts (Hall of Fame, 1991+)
supabase/migrations/   SQL schema + scoring (0001–0018)
scripts/        one-shot importers + reproducible fixers (fix-historical-gc, populate-dropouts, …)
```

## Live updates

The Vercel cron (and `/admin/refresh`) call `refreshLive(year)` for the live
year (`TDF_YEAR`): it pulls stages + GC + withdrawals + jersey leaders from
letour.fr, seeds riders from the result names, resolves IDs, and scores. Frozen
historical pools are skipped so finished data can't be re-corrupted.

## Running locally

```bash
npm install
cp .env.example .env.local   # Supabase URL + keys
npm run dev
```

Migrations are applied in the Supabase SQL editor (no local DB connection):
`cat supabase/migrations/NNNN_*.sql | pbcopy`, then paste and run.
