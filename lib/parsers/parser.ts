// Shared parser logic: state machine that reduces an event stream to a ParsedPool.
// The Python reference is scripts/validate_parser.py — keep behaviour aligned.

import type { ParsedPool, ParsedTeam, ParserEvent } from "./types";

const HEADER_RE = /^([A-Z][A-Za-z][A-Za-z .\-]*?)\s*[’']\s*s\s+(.+)$/;
const RESERVES_PREFIX_RE = /^\s*reserve/i;
const RESERVE_ITEM_RE =
  /\d+\s*[\)\.]\s*([A-Za-z][A-Za-z .\-’']*?)(?=\s*(?:\d+\s*[\)\.]|$))/g;

const HEADER_NOISE = [
  "dear teamleaders",
  "the rules",
  "the scoring",
  "etappe placing",
  "have fun",
  "remember at the start",
  "final placing",
];

export const SKIP_HEADERS = new Set([
  "renner/etappe",
  "dagtotaal",
  "cumulatief",
  "totaal",
]);

export function isNoise(text: string): boolean {
  const t = text.toLowerCase();
  return HEADER_NOISE.some((n) => t.includes(n));
}

export function findYear(text: string): number | null {
  const m = text.match(/\bTour\s+(\d{4})\b/);
  return m ? parseInt(m[1], 10) : null;
}

/** Extract a clean possessive header like "Quinten's Let's Win again". */
export function extractHeader(
  text: string,
): { player: string; team_name: string } | null {
  const line = text.trim();
  if (!line || line.length > 120 || isNoise(line)) return null;
  if (/reserve/i.test(line)) return null;
  const m = line.match(HEADER_RE);
  if (!m) return null;
  const player = m[1].trim();
  const team_name = m[2].trim();
  if (!player || player.length > 30 || team_name.length > 100) return null;
  return { player, team_name };
}

/**
 * Split a "Reserve's: ..." paragraph into its reserves list and any trailing
 * team header that got concatenated to it. See validate_parser.py for cases.
 */
export function parseReservesParagraph(text: string): {
  reserves: string[];
  trailingHeader: { player: string; team_name: string } | null;
} {
  const body = text.includes(":") ? text.split(":").slice(1).join(":") : text;
  const items: string[] = [];
  for (const m of body.matchAll(RESERVE_ITEM_RE)) {
    const v = m[1].trim();
    if (v) items.push(v);
  }
  if (items.length === 0) return { reserves: [], trailingHeader: null };

  let trailing: { player: string; team_name: string } | null = null;
  let last = items[items.length - 1];

  // Case A: trailing chunk after the last reserve word, with explicit "X's Y".
  const lastIdx = body.lastIndexOf(last);
  const after = lastIdx >= 0 ? body.slice(lastIdx + last.length).trim() : "";
  if (after) {
    const m = after.match(/\b([A-Z][a-zA-Z]+)\s*[’']s\s+([\s\S]+)$/);
    if (m) trailing = { player: m[1].trim(), team_name: m[2].trim() };
  }

  // Case B: possessive INSIDE the last reserve match because the lazy regex
  // gobbled the whole tail.
  if (!trailing && /[’']s\s+/.test(last)) {
    const m = last.match(
      /^([\s\S]+?)\s+([A-Z][a-zA-Z]+)\s*[’']s\s+([\s\S]+)$/,
    );
    if (m) {
      items[items.length - 1] = m[1].trim();
      last = items[items.length - 1];
      trailing = { player: m[2].trim(), team_name: m[3].trim() };
    }
  }

  return { reserves: items, trailingHeader: trailing };
}

export function cleanRiderName(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Reduce an event stream to a ParsedPool. Missing headers become "Unknown_N"
 * and surface in `unresolved` so the /admin/upload UI can prompt for a name.
 */
export function reduceEvents(
  source: string,
  year: number | null,
  events: Iterable<ParserEvent>,
): ParsedPool {
  const teams: ParsedTeam[] = [];
  const unresolved: string[] = [];
  let pendingHeader: { player: string; team_name: string } | null = null;
  let openTeam: ParsedTeam | null = null;

  const makeUnknown = () => `Unknown_${teams.length + 1}`;

  for (const ev of events) {
    if (ev.kind === "header") {
      pendingHeader = { player: ev.player, team_name: ev.team_name };
    } else if (ev.kind === "table") {
      // Doc ended without reserves for the previous team — close it now.
      if (openTeam) {
        teams.push(openTeam);
        openTeam = null;
      }
      let player: string;
      let team_name: string;
      let needs = false;
      if (pendingHeader) {
        player = pendingHeader.player;
        team_name = pendingHeader.team_name;
        pendingHeader = null;
      } else {
        player = makeUnknown();
        team_name = "";
        needs = true;
        unresolved.push(player);
      }
      openTeam = {
        player,
        team_name,
        riders: ev.riders.slice(),
        reserves: [],
        needs_attention: needs,
      };
    } else {
      // reserves
      const { reserves, trailingHeader } = parseReservesParagraph(ev.text);
      if (openTeam) {
        openTeam.reserves = reserves;
        teams.push(openTeam);
        openTeam = null;
      } else {
        unresolved.push(`orphan_reserves:${reserves.join(",")}`);
      }
      if (trailingHeader) pendingHeader = trailingHeader;
    }
  }

  if (openTeam) teams.push(openTeam);

  return {
    source,
    year,
    team_count: teams.length,
    teams,
    unresolved,
  };
}
