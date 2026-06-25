# TdF-Poule Project Memory

## Project Overview
Tour de France family pool (fantasy cycling) web app. Next.js 14 + Supabase + Tailwind + Vercel.
Family members pick riders before the Tour; points auto-calculated from PCS scraping.

## Key Architecture
- **Supabase**: Postgres DB with SQL views for scoring (`v_leaderboard`, `v_team_stage_matrix`, etc.)
- **PCS Scraper**: `lib/scraper/pcs.ts` fetches stage results from ProCyclingStats
- **Scoring**: SQL functions + `lib/scoring/` handle reserve substitutions (stages 1-6 only)
- **Parsers**: `lib/parsers/docx.ts` + `csv.ts` parse family Word/CSV team submissions
- **Admin**: Upload teams via docx, resolve ambiguous picks, refresh results from PCS
- **Public**: Leaderboard, stage matrix, riders table, team detail — no auth needed

## Database
- Pool → Teams → TeamRiders (picks) → linked to Riders (canonical)
- StageResults + FinalGC → scoring views compute points
- Historical data: 2020-2025 in seed_history.sql (2023 is missing from validator-output)
- `match_status`: matched/ambiguous/unmatched/manual — unmatched picks score 0

## .env.local
- Must use `=` between key and value
- NEXT_PUBLIC_SUPABASE_URL should be `https://PROJECT.supabase.co` (no /rest/v1/)
- Supabase project ref: tuaobtzdoahilsrjrpwm

## Design Theme (2025-06 redesign)
- Yellow jersey gradient header, amber accent palette
- Podium cards for top 3 on leaderboard
- Rounded-2xl cards, cycling emojis, road-stripe decoration
- Family-friendly tone: "Hall of Fame", cycling puns in error pages
- Error boundaries with cycling theme ("Flat tyre on the road!")

## Historical Data Status
- Years in seed: 2020, 2021, 2022, 2024, 2025 (2023 MISSING from validator-output)
- All seeded picks are match_status='unmatched' — need `/admin/refresh` per year to link riders
- Stage results only exist after running the PCS scraper for each year
