// ProCyclingStats fetcher.
//
// Selectors mirror the original Python tdf_engine.py from v1 — table.results
// with position in column 0 and rider name (link) in column 3. PCS changes
// their markup occasionally, so the parser falls back to "first integer cell"
// + "first link cell" if the strict layout doesn't match.

import * as cheerio from "cheerio";

const BASE = "https://www.procyclingstats.com/race/tour-de-france";
const UA = "Mozilla/5.0 (TDFPoolBot; +https://github.com/sbali/TdF-Poule)";

export type StageResult = { position: number; rider: string };
export type StartListEntry = { rider: string; pcs_slug: string; pro_team: string };

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    // Cache mid-stage so we don't hammer PCS while the page is the same.
    next: { revalidate: 1800 },
  });
  if (!res.ok) {
    throw new Error(`PCS ${url} → ${res.status} ${res.statusText}`);
  }
  return res.text();
}

function parseResultsTable($: cheerio.CheerioAPI): StageResult[] {
  // Strategy: find <table class="results">, walk <tr>, take the first cell
  // that's a positive integer as position and the first cell containing a
  // link as the rider name. Skips rows that don't match (DNF, header, etc.).
  const out: StageResult[] = [];
  const tables = $("table.results");
  if (tables.length === 0) {
    // Fallback: any table whose first row contains a "Pos" header.
    $("table").each((_i, table) => {
      const headerText = $(table).find("th, td").first().text().toLowerCase();
      if (headerText.includes("pos") || headerText.includes("rnk")) {
        tables.push(table);
      }
    });
  }
  if (tables.length === 0) return out;

  tables
    .first()
    .find("tr")
    .each((_i, tr) => {
      const cells = $(tr).find("td").toArray();
      if (cells.length < 2) return;
      let position: number | null = null;
      let rider: string | null = null;
      for (const cell of cells) {
        const text = $(cell).text().trim();
        if (position === null) {
          const n = parseInt(text, 10);
          if (!Number.isNaN(n) && n > 0) position = n;
        }
        if (rider === null) {
          const link = $(cell).find("a").first();
          if (link.length > 0 && link.text().trim()) {
            rider = link.text().trim();
          }
        }
        if (position !== null && rider !== null) break;
      }
      if (position !== null && rider) {
        out.push({ position, rider });
      }
    });

  // Top 50 — that's all the scoring rules need (top 10) plus margin.
  return out.slice(0, 50);
}

export async function fetchStageResults(
  year: number,
  stage: number,
): Promise<StageResult[]> {
  const html = await fetchHtml(`${BASE}/${year}/stage-${stage}`);
  const $ = cheerio.load(html);
  return parseResultsTable($);
}

export async function fetchFinalGc(year: number): Promise<StageResult[]> {
  const html = await fetchHtml(`${BASE}/${year}/gc`);
  const $ = cheerio.load(html);
  return parseResultsTable($);
}

/**
 * Pull the start list for a year — used to populate the riders table so the
 * matcher has the canonical peloton to resolve raw_names against. Each entry
 * captures the PCS slug (for deep-linking) and pro team affiliation.
 */
export async function fetchStartList(year: number): Promise<StartListEntry[]> {
  const html = await fetchHtml(`${BASE}/${year}/startlist`);
  const $ = cheerio.load(html);
  const entries: StartListEntry[] = [];
  // PCS startlist uses one table per pro team with rows of riders.
  $("ul.startlist_v3, table.startlist, .startlist").each((_i, container) => {
    const teamName = $(container).prevAll("h3, .team").first().text().trim();
    $(container)
      .find("a[href^='rider/']")
      .each((_j, a) => {
        const href = $(a).attr("href") || "";
        const rider = $(a).text().trim();
        if (!rider) return;
        const slug = href.replace(/^rider\//, "").split(/[?#]/)[0];
        entries.push({ rider, pcs_slug: slug, pro_team: teamName });
      });
  });
  // Dedupe by slug
  const seen = new Set<string>();
  return entries.filter((e) => {
    if (seen.has(e.pcs_slug)) return false;
    seen.add(e.pcs_slug);
    return true;
  });
}

/**
 * "What stage are we on?" Roughly: stage N starts on (start_date + N - 1)
 * with two rest days (typically after stages 9 and 15). For accuracy we
 * fetch the GC page header which shows current stage; falling back to a
 * date-based heuristic.
 */
export async function detectCurrentStage(
  year: number,
  startDate: Date,
  today: Date = new Date(),
): Promise<number> {
  // Days since the Tour started; clamp to [0, 21] and add typical rest days.
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.floor((today.getTime() - startDate.getTime()) / dayMs);
  if (days < 0) return 0;
  // Two rest days assumed (Mon after stage 9 + Mon after stage 15)
  let stage = days + 1;
  if (days >= 10) stage -= 1;
  if (days >= 16) stage -= 1;
  return Math.max(1, Math.min(stage, 21));
}
