// ProCyclingStats fetcher.
//
// PCS doesn't publish a stable public API and their HTML changes occasionally.
// This module is deliberately permissive — selectors are written to find rider
// links and team labels by structure (an <a> with href starting with "rider/")
// rather than depending on specific class names that come and go.
//
// Three things we extract:
//   fetchStageResults(year, stage)   →  position + rider name + pcs_slug + pro_team
//   fetchFinalGc(year)               →  same for the final GC table
//   fetchStartList(year)             →  every rider in the race, with team

import * as cheerio from "cheerio";

const BASE = "https://www.procyclingstats.com/race/tour-de-france";
const UA = "Mozilla/5.0 (TDFPoolBot; +https://github.com/sbali/TdF-Poule)";

export type StageResult = {
  position: number;
  rider: string;
  pcs_slug: string | null;
  pro_team: string | null;
};

export type StartListEntry = {
  rider: string;
  pcs_slug: string;
  pro_team: string | null;
  bib_number: number | null;
};

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    next: { revalidate: 1800 },
  });
  if (!res.ok) {
    throw new Error(`PCS ${url} → ${res.status} ${res.statusText}`);
  }
  return res.text();
}

/** Extract /rider/{slug} from any anchor href. Returns null if it isn't a rider link. */
function riderSlug(href: string | undefined): string | null {
  if (!href) return null;
  const m = href.match(/(?:^|\/)rider\/([^?#/]+)/);
  return m ? m[1] : null;
}

/** Extract /team/{slug} from any anchor href. */
function teamSlug(href: string | undefined): string | null {
  if (!href) return null;
  const m = href.match(/(?:^|\/)team\/([^?#/]+)/);
  return m ? m[1] : null;
}

/**
 * Walk all rows of a results table and pick out (position, rider link, team link).
 * Resilient to extra columns, missing columns, and cosmetic class changes — we
 * just look for the first integer cell + the first /rider/ link + the first
 * /team/ link in each row.
 */
function parseResultsTable($: cheerio.CheerioAPI): StageResult[] {
  let primary = $("table.results").first();
  if (primary.length === 0) {
    $("table").each((_i, table) => {
      if (primary.length > 0) return;
      const headerText = $(table).find("th, td").first().text().toLowerCase();
      if (
        headerText.includes("pos") ||
        headerText.includes("rnk") ||
        headerText.includes("rider")
      ) {
        primary = $(table);
      }
    });
  }
  if (primary.length === 0) return [];

  const out: StageResult[] = [];
  primary.find("tr").each((_i, tr) => {
    const $tr = $(tr);
    const cells = $tr.find("td").toArray();
    if (cells.length < 2) return;

    let position: number | null = null;
    let rider: string | null = null;
    let pcs_slug: string | null = null;
    let pro_team: string | null = null;

    for (const cell of cells) {
      const $cell = $(cell);
      const text = $cell.text().trim();

      if (position === null) {
        const n = parseInt(text, 10);
        if (!Number.isNaN(n) && n > 0) position = n;
      }

      if (rider === null) {
        const riderLink = $cell
          .find("a")
          .filter((_j, a) => riderSlug($(a).attr("href")) !== null)
          .first();
        if (riderLink.length > 0) {
          const txt = riderLink.text().trim();
          if (txt) {
            rider = normalizeRiderName(txt);
            pcs_slug = riderSlug(riderLink.attr("href"));
          }
        }
      }

      if (pro_team === null) {
        const teamLink = $cell
          .find("a")
          .filter((_j, a) => teamSlug($(a).attr("href")) !== null)
          .first();
        if (teamLink.length > 0) {
          const txt = teamLink.text().trim();
          if (txt) pro_team = txt;
        }
      }

      if (position !== null && rider !== null && pro_team !== null) break;
    }

    if (position !== null && rider) {
      out.push({ position, rider, pcs_slug, pro_team });
    }
  });

  return out.slice(0, 50);
}

/**
 * PCS shows rider names like "POGAČAR Tadej" (last name in caps, then first)
 * in stage tables. Convert to canonical "Tadej Pogačar" for storage.
 */
function normalizeRiderName(raw: string): string {
  const parts = raw.trim().split(/\s+/);
  if (parts.length < 2) return raw.trim();
  // Detect "LASTNAME First" by leading all-uppercase tokens. The surname can be
  // MULTIPLE caps tokens for nobiliary particles: "VAN AERT Wout",
  // "VAN DER POEL Mathieu", "DE LIE Arnaud" — take ALL leading caps tokens as
  // the surname, not just the first (which produced "AERT Wout Van").
  const isCaps = (t: string) => t === t.toUpperCase() && /[A-ZÀ-Ý]/.test(t);
  if (isCaps(parts[0])) {
    let n = 0;
    while (n < parts.length - 1 && isCaps(parts[n])) n++;
    const lastTitle = parts
      .slice(0, n)
      .map((t) => t.charAt(0) + t.slice(1).toLowerCase())
      .join(" ");
    const first = parts.slice(n).join(" ");
    return `${first} ${lastTitle}`.trim();
  }
  return raw.trim();
}

/** Extract last name from a canonical-form full name. Handles compound names. */
export function lastNameOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return fullName;
  if (parts.length === 1) return parts[0];
  // Common Dutch/Flemish particles: van, de, der, den, etc. become part of last name.
  const particles = new Set([
    "van", "de", "der", "den", "del", "della", "di", "da", "du",
    "le", "la", "von", "zum", "ten", "ter",
  ]);
  // Walk back from the end, including any particle words as part of the surname.
  let i = parts.length - 1;
  while (i > 0 && particles.has(parts[i - 1].toLowerCase())) i--;
  return parts.slice(i).join(" ");
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
 * Permissive start list parser.
 *
 * Strategy: walk every <a> on the page; any href matching /rider/{slug} is a
 * rider entry. For pro_team, find the nearest preceding /team/{slug} link or
 * heading. For bib_number, look for the nearest small integer text node.
 *
 * Works regardless of whether PCS uses <ul>, <table>, or <div> for the layout.
 */
export async function fetchStartList(year: number): Promise<StartListEntry[]> {
  const html = await fetchHtml(`${BASE}/${year}/startlist`);
  const $ = cheerio.load(html);

  const seen = new Set<string>();
  const entries: StartListEntry[] = [];

  // Track the most recently seen team label as we walk the document. Each
  // rider link gets associated with whatever team header was closest above it.
  let currentTeam: string | null = null;

  // Walk in document order so currentTeam stays in sync.
  $("body *").each((_i, el) => {
    const $el = $(el);
    const tag = (el as { tagName?: string }).tagName?.toLowerCase() ?? "";
    if (tag === "a") {
      const href = $el.attr("href");
      const tslug = teamSlug(href);
      if (tslug) {
        // Only update the running team if this link's text is non-empty
        const txt = $el.text().trim();
        if (txt && txt.length > 2 && txt.length < 80) currentTeam = txt;
        return;
      }
      const rslug = riderSlug(href);
      if (rslug && !seen.has(rslug)) {
        const txt = $el.text().trim();
        if (!txt) return;
        seen.add(rslug);
        entries.push({
          rider: normalizeRiderName(txt),
          pcs_slug: rslug,
          pro_team: currentTeam,
          bib_number: null,
        });
      }
    } else if (tag === "h2" || tag === "h3" || tag === "h4") {
      const txt = $el.text().trim();
      // Heuristic: short text near a list of riders is probably a team header.
      if (txt && txt.length > 2 && txt.length < 80) currentTeam = txt;
    }
  });

  return entries;
}

/**
 * "What stage are we on?" — figures out how many stages of the given year's
 * Tour have completed.
 *
 *   - Past year      → 21 (the whole Tour is in the books)
 *   - Future year    → 0  (it hasn't started yet)
 *   - Current year   → derived from start_date if we have one;
 *                      else 0 (be conservative — wait until the user sets a date)
 *
 * Within the current year, we use the (today − start_date) day delta and
 * subtract typical rest days (one after stage 9, one after stage 15).
 */
export async function detectCurrentStage(
  year: number,
  startDate: Date | null,
  today: Date = new Date(),
): Promise<number> {
  const currentYear = today.getUTCFullYear();
  if (year < currentYear) return 21;
  if (year > currentYear) return 0;
  if (!startDate) return 0;

  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.floor((today.getTime() - startDate.getTime()) / dayMs);
  if (days < 0) return 0;
  let stage = days + 1;
  if (days >= 10) stage -= 1;
  if (days >= 16) stage -= 1;
  return Math.max(1, Math.min(stage, 21));
}
