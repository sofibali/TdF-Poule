// NOS Teletekst scraper — an alternative live-results source to PCS.
//
// Why: procyclingstats.com is behind Cloudflare, which intermittently blocks
// the scraper (that's how the historical GC got corrupted). NOS Teletekst has a
// plain JSON API that is NOT bot-walled and reachable from Vercel, and it
// publishes the per-stage top finishers + GC during the Tour — which is exactly
// (and only) what scoring needs, since just positions 1–10 score points.
//
// STATUS: the fetch + decode layer below is verified against the live API. The
// cycling RESULT-LINE parser (parseCyclingResults) is a best-effort against the
// standard NOS layout and must be smoke-tested against a real cycling page once
// one exists (during the 2026 Tour, or any stage race NOS covers). Use
// `scripts/nos-probe.ts <page>` to dump a page and check the parse.
//
// Teletekst quirk: styled characters are encoded in the Unicode Private Use
// Area at codepoint + 0xF000 (so '4' arrives as &#xF034;). decodeTeletekst()
// maps them back to ASCII.

import type { StageResult } from "@/lib/scraper/pcs";

const TT_BASE = "https://teletekst-data.nos.nl/json";

export type TeletekstPage = {
  page: number;
  text: string; // decoded, newline-separated grid
  prevPage: number | null;
  nextPage: number | null;
};

export function decodeTeletekst(content: string): string {
  return content
    .replace(/<[^>]+>/g, "") // strip the color/markup spans
    .replace(/&#x([0-9A-Fa-f]+);/g, (_m, hex) => {
      const cp = parseInt(hex, 16);
      // PUA-offset styled glyphs (0xF020–0xF0FF) → their ASCII equivalents.
      return String.fromCharCode(cp >= 0xf000 && cp <= 0xf0ff ? cp - 0xf000 : cp);
    })
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;/g, " ");
}

export async function fetchTeletekstPage(page: number): Promise<TeletekstPage> {
  const res = await fetch(`${TT_BASE}/${page}`, {
    headers: { "User-Agent": "Mozilla/5.0 (TDFPoolBot)" },
  });
  if (!res.ok) throw new Error(`NOS teletekst ${page} → ${res.status}`);
  const j = (await res.json()) as {
    content?: string;
    prevPage?: string;
    nextPage?: string;
  };
  return {
    page,
    text: decodeTeletekst(j.content ?? ""),
    prevPage: j.prevPage ? parseInt(j.prevPage, 10) : null,
    nextPage: j.nextPage ? parseInt(j.nextPage, 10) : null,
  };
}

// A teletekst result line is typically:  " 1 Pogacar            4.12.34"
// or, for placings behind the winner:    " 2 Vingegaard           + 1.10"
// Leading rank, rider text in the middle, a time/gap token at the end.
const RESULT_LINE =
  /^\s*(\d{1,3})[.\s]\s*([A-Za-z][A-Za-z.''\- ]+?)\s+(?:\+?\s*\d[\d.:'"]*|\bz\.t\.\b).*$/;

/**
 * Parse a decoded teletekst page (a stage result or GC page) into StageResult[].
 * Returns the rows it could confidently read; non-result lines are ignored.
 * pcs_slug/pro_team are null — riders get harvested from the names downstream.
 */
export function parseCyclingResults(pageText: string): StageResult[] {
  const out: StageResult[] = [];
  const seen = new Set<number>();
  for (const raw of pageText.split("\n")) {
    const m = raw.match(RESULT_LINE);
    if (!m) continue;
    const position = parseInt(m[1], 10);
    const rider = m[2].replace(/\s+/g, " ").trim();
    if (!position || position > 99 || seen.has(position) || rider.length < 2) {
      continue;
    }
    seen.add(position);
    out.push({ position, rider, pcs_slug: null, pro_team: null });
  }
  return out.sort((a, b) => a.position - b.position);
}
