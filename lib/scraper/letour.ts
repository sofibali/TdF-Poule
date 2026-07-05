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

const HOST = "https://www.letour.fr";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

/** Fetch a host-relative path (e.g. "/en/rankings" or an ajax "/en/ajax/..."). */
async function fetchHtml(path: string): Promise<string> {
  const res = await fetch(`${HOST}${path}`, {
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
  return parseRankingTable(await fetchHtml("/en/rankings"));
}

export async function fetchLetourStage(stage: number): Promise<StageResult[]> {
  return parseRankingTable(await fetchHtml(`/en/rankings/stage-${stage}`));
}

/**
 * StageResult extended with an optional scoring_position for TTT stages.
 * For a TTT all riders on the same team share the same scoring_position
 * (= their team's finishing rank), even though letour assigns unique
 * individual positions. scoring_position is what v_team_stage_points uses
 * for the point table lookup via COALESCE(scoring_position, position).
 */
export type StageResultWithScoring = StageResult & { scoring_position: number | null };

/**
 * Fetch a stage result, detecting Team Time Trials automatically.
 *
 * Detection: if >1 rider from the same team appears in the first 10 rows,
 * it's a TTT. In that case all riders are returned with scoring_position =
 * their team's finishing rank (first occurrence of that team in the ordered
 * list). Individual letour positions (1–184) are preserved as position.
 */
export async function fetchLetourStageWithTTT(
  stage: number,
): Promise<StageResultWithScoring[]> {
  const html = await fetchHtml(`/en/rankings/stage-${stage}`);
  const rows = parseRankingTable(html);
  if (rows.length === 0) return [];

  // Detect TTT: check whether any team appears twice in the first 10 rows.
  const first10Teams = rows.slice(0, 10).map((r) => r.pro_team ?? "");
  const uniqueFirst10 = new Set(first10Teams.filter(Boolean));
  const isTTT = uniqueFirst10.size < first10Teams.filter(Boolean).length;

  if (!isTTT) {
    return rows.map((r) => ({ ...r, scoring_position: null }));
  }

  // TTT: assign scoring_position = team rank (1-indexed first occurrence).
  const teamRank = new Map<string, number>();
  for (const r of rows) {
    const team = r.pro_team ?? "";
    if (team && !teamRank.has(team)) teamRank.set(team, teamRank.size + 1);
  }
  return rows.map((r) => ({
    ...r,
    scoring_position: teamRank.get(r.pro_team ?? "") ?? null,
  }));
}

// letour classification codes → our jersey names.
const JERSEY_CODES = {
  itg: "gc", // yellow
  ipg: "points", // green
  img: "mountain", // polka dot
  ijg: "youth", // white
} as const;
export type Jersey = (typeof JERSEY_CODES)[keyof typeof JERSEY_CODES];
export type JerseyStandings = Record<Jersey, StageResult[]>;

/**
 * The four jersey classifications AS OF a given stage. Each stage page embeds
 * per-classification ajax endpoints (with a per-page hash); we read those.
 * Standings[..][0] is the jersey holder after that stage.
 */
export async function fetchLetourJerseys(stage: number): Promise<JerseyStandings> {
  const page = await fetchHtml(`/en/rankings/stage-${stage}`);
  const urls: Record<string, string> = {};
  for (const m of page.matchAll(/&quot;(itg|ipg|img|ijg)&quot;:&quot;([^&]+)&quot;/g)) {
    urls[m[1]] = m[2].replace(/\\\//g, "/");
  }
  const out = { gc: [], points: [], mountain: [], youth: [] } as JerseyStandings;
  for (const [code, name] of Object.entries(JERSEY_CODES)) {
    if (!urls[code]) continue;
    try {
      out[name] = parseRankingTable(await fetchHtml(urls[code]));
    } catch {
      /* leave empty on a missing classification */
    }
  }
  return out;
}

/** Just the jersey holders (position 1) after a stage. */
export async function fetchLetourJerseyLeaders(
  stage: number,
): Promise<Partial<Record<Jersey, string>>> {
  const j = await fetchLetourJerseys(stage);
  const leaders: Partial<Record<Jersey, string>> = {};
  for (const k of Object.values(JERSEY_CODES)) {
    if (j[k]?.[0]) leaders[k] = j[k][0].rider;
  }
  return leaders;
}

/**
 * Youth bonus awards for a stage, plus jersey holders for display.
 *
 * Normal stages: top-3 youth-eligible finishers earn 3/2/1 bonus points.
 * TTT:           every youth-eligible rider on a top-3 team earns +1.
 *
 * TTT is detected by fetchLetourStageWithTTT (same logic: team appears
 * twice in first 10 rows). When TTT, youthAwards contains one entry per
 * youth-eligible rider on a top-3 team, each with bonusPoints=1.
 *
 * holders: the four jersey wearers after the stage (backup / display feed).
 */
export async function fetchLetourStageJerseys(stage: number): Promise<{
  youthAwards: Array<{ rider: string; bonusPoints: number }>;
  holders: Partial<Record<Jersey, string>>;
}> {
  const [stageRows, j] = await Promise.all([
    fetchLetourStageWithTTT(stage),
    fetchLetourJerseys(stage),
  ]);

  const holders: Partial<Record<Jersey, string>> = {};
  for (const k of Object.values(JERSEY_CODES)) if (j[k]?.[0]) holders[k] = j[k][0].rider;

  const youthSet = new Set(j.youth.map((r) => r.rider.toLowerCase()));
  const youthAwards: Array<{ rider: string; bonusPoints: number }> = [];

  // Top-3 youth finishers by individual finish position get 4/3/2.
  // Works for both normal stages and TTT: stageRows is ordered by individual
  // finish position in both cases, so iterating it gives the correct youth
  // finishing order regardless of stage type.
  const bonusScale = [4, 3, 2];
  let youthRank = 0;
  for (const r of stageRows) {
    if (youthSet.has(r.rider.toLowerCase())) {
      youthAwards.push({ rider: r.rider, bonusPoints: bonusScale[youthRank] });
      youthRank++;
      if (youthRank >= bonusScale.length) break;
    }
  }

  return { youthAwards, holders };
}

export type StartListEntry = {
  bib: number;
  full_name: string;
  last_name: string;
  team_name: string; // official name e.g. "UAE TEAM EMIRATES XRG"
  team_slug: string; // letour slug e.g. "uae-team-emirates-xrg" (TTT matching key)
};

/**
 * Full 2026 start list from /en/riders.
 * Returns all 184 riders with bib number, official team name, and team slug.
 * Team slug is critical for TTT result matching — letour shows team names in
 * TTT results and we need to expand them to individual riders.
 */
export async function fetchLetourStartList(): Promise<StartListEntry[]> {
  const html = await fetchHtml("/en/riders");
  const entries: StartListEntry[] = [];

  // Build bib-ordered entry list from rider links.
  const riderLinks: Array<{ bib: number; team_slug: string; rider_slug: string }> = [];
  for (const m of html.matchAll(/\/en\/rider\/(\d+)\/([^/\"]+)\/([^\"]+)/g)) {
    riderLinks.push({
      bib: parseInt(m[1], 10),
      team_slug: m[2],
      rider_slug: m[3],
    });
  }

  // Find official team name for each team slug: it appears in the HTML just
  // before the first rider of each team (all-caps header text).
  const teamNames = new Map<string, string>();
  for (const { bib, team_slug } of riderLinks) {
    if (teamNames.has(team_slug)) continue;
    const idx = html.indexOf(`/en/rider/${bib}/${team_slug}/`);
    const before = html.slice(Math.max(0, idx - 500), idx);
    // Extract last run of ALL-CAPS text (10–80 chars, includes spaces/hyphens/pipes)
    const caps = [...before.matchAll(/[A-Z][A-Z &|'\-ÀÂÉÈÊËÎÏÔÙÛÜ\.]{8,79}/g)];
    if (caps.length) teamNames.set(team_slug, caps[caps.length - 1][0].trim());
  }

  for (const { bib, team_slug, rider_slug } of riderLinks) {
    const full_name = nameFromSlug(rider_slug);
    // last_name = last hyphen-group in the slug (handles "del-toro-romero" → "Romero")
    // but for matching purposes we want the full canonical last-name as stored.
    // Use the same lastNameOf logic the rest of the app uses (imported via pcs).
    const parts = rider_slug.split("-").filter(Boolean);
    const last_name = parts[parts.length - 1]
      ? parts[parts.length - 1].charAt(0).toUpperCase() + parts[parts.length - 1].slice(1)
      : full_name;
    entries.push({
      bib,
      full_name,
      last_name,
      team_name: teamNames.get(team_slug) ?? team_slug,
      team_slug,
    });
  }
  return entries.sort((a, b) => a.bib - b.bib);
}

/**
 * Withdrawals grouped by the stage they happened in. A rider listed under
 * "stage N" left during/before stage N, so dropout_after_stage = N - 1
 * (matches scripts/populate-dropouts.ts).
 */
export async function fetchLetourWithdrawals(): Promise<
  { rider: string; stage: number }[]
> {
  const html = await fetchHtml("/en/withdrawal");
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
