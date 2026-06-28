// Live results scraper for the OFFICIAL Tour site, letour.fr.
//
// Why: procyclingstats.com is Cloudflare-blocked. letour.fr is reachable, server
// -rendered, and carries everything scoring needs for the CURRENT edition:
//   - GC                 /en/rankings
//   - a stage result     /en/rankings/stage-<n>
//   - withdrawals (DNF)   /en/withdrawal   (grouped by id="stage-<n>")
//
// It only serves the live/most-recent Tour (no year param) — which is exactly
// what a live 2026 feed wants. Right now it returns the 2025 edition, so the
// parsers below are validated against 2025 (see scripts/test-letour.ts).
//
// Each results row links to /en/rider/<bib>/<team-slug>/<firstname-lastname>,
// so we pull the full name from the slug (the visible text is only "T. POGACAR").

import * as cheerio from "cheerio";

import type { StageResult } from "./pcs";

const BASE = "https://www.letour.fr/en";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

async function fetchHtml(path: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "User-Agent": UA },
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`letour ${path} → ${res.status}`);
  return res.text();
}

/** "tadej-pogacar" → "Tadej Pogacar" (accents are lost in the slug but the
 *  canonical matcher normalises them away anyway). */
function nameFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function riderSlug(href: string | undefined): string | null {
  const m = href?.match(/\/rider\/\d+\/[^/]+\/([^/?#"]+)/);
  return m ? m[1] : null;
}

/** Parse a /rankings or /rankings/stage-N table → ordered StageResult[]. */
function parseRankingTable(html: string): StageResult[] {
  const $ = cheerio.load(html);
  const out: StageResult[] = [];
  const seen = new Set<number>();
  $("tr").each((_i, tr) => {
    const $tr = $(tr);
    const tds = $tr.find("td").toArray();
    if (tds.length < 4) return;
    const pos = parseInt($(tds[0]).text().trim(), 10);
    if (!pos || seen.has(pos)) return;
    const slug = riderSlug($tr.find('a[href*="/rider/"]').first().attr("href"));
    const rider = slug
      ? nameFromSlug(slug)
      : $(tds[1]).text().replace(/\s+/g, " ").trim();
    if (!rider) return;
    const team = $(tds[3]).text().replace(/\s+/g, " ").trim();
    seen.add(pos);
    out.push({ position: pos, rider, pcs_slug: null, pro_team: team || null });
  });
  return out.sort((a, b) => a.position - b.position);
}

export async function fetchLetourGc(): Promise<StageResult[]> {
  return parseRankingTable(await fetchHtml("/rankings"));
}

export async function fetchLetourStage(stage: number): Promise<StageResult[]> {
  return parseRankingTable(await fetchHtml(`/rankings/stage-${stage}`));
}

/**
 * Withdrawals grouped by the stage they happened in. A rider listed under
 * "stage N" left during/before stage N, so dropout_after_stage = N - 1
 * (matches scripts/populate-dropouts.ts).
 */
export async function fetchLetourWithdrawals(): Promise<
  { rider: string; stage: number }[]
> {
  const html = await fetchHtml("/withdrawal");
  const out: { rider: string; stage: number }[] = [];
  const parts = html.split(/id="stage-(\d+)"/);
  // parts = [pre, "1", chunk1, "2", chunk2, ...]
  for (let i = 1; i < parts.length; i += 2) {
    const stage = parseInt(parts[i], 10);
    const chunk = parts[i + 1] ?? "";
    for (const m of chunk.matchAll(/\/rider\/\d+\/[^/]+\/([^/?#"]+)/g)) {
      out.push({ rider: nameFromSlug(m[1]), stage });
    }
  }
  return out;
}
