// Single source of truth for matching a raw pick name against a year's peloton.
//
// Historically this logic was copy-pasted into four places (lib/scoring/match.ts,
// resolve-picks.ts, lib/scraper/refresh.ts, scripts/resolve-all-picks.ts) and they
// drifted — e.g. only some handled apostrophes, so "O Connor" matched in one path
// and not another. Everything that resolves team picks now calls matchRider() here.
//
// Pipeline for a raw name like "Pogačar", "T. Pogačar", or a misspelling:
//   1. Apply the per-year corrections map (typos + disambiguation). See
//      name-corrections.json — that's where you fix a name once, forever.
//   2. Exact match: rider whose last_name (or any full_name token) equals the
//      picked last name.
//   3. Substring fallback (only if step 2 found nobody): catches "O Connor" vs
//      "O'Connor", "VanderPoel" vs "Van Der Poel".
//   4. If several candidates remain and the pick carries a first name/initial,
//      narrow by it.

import corrections from "./name-corrections.json";

export type RiderRow = {
  id: string;
  full_name: string;
  last_name: string;
};

export type MatchOutcome =
  | { kind: "matched"; rider: RiderRow }
  | { kind: "ambiguous"; candidates: RiderRow[] }
  | { kind: "unmatched" };

// The JSON carries a "_README" string alongside the per-year maps; cast through
// unknown and skip that key at lookup time.
const CORRECTIONS = corrections as unknown as Record<
  string,
  Record<string, string>
>;

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .replace(/[^a-z]/g, "");
}

/**
 * Look up the corrected spelling/disambiguation for a raw pick in a given year.
 * Returns the input unchanged when there's no correction. Case-insensitive on
 * the key; ignores a trailing-space sloppiness in the source.
 */
export function applyCorrection(rawName: string, year?: number | null): string {
  if (year == null) return rawName;
  const table = CORRECTIONS[String(year)];
  if (!table) return rawName;
  const key = rawName.trim();
  if (table[key]) return table[key];
  // Case-insensitive fallback so "thomas" and "Thomas" both hit.
  const lower = key.toLowerCase();
  for (const k of Object.keys(table)) {
    if (k === "_README") continue;
    if (k.toLowerCase() === lower) return table[k];
  }
  return rawName;
}

function firstNameTokens(rider: RiderRow, pickedLast: string): string[] {
  // Tokens of the full name that aren't the matched last name — i.e. the
  // first/middle names we narrow on.
  return rider.full_name
    .split(/\s+/)
    .map(normalize)
    .filter((t) => t && t !== pickedLast);
}

export function matchRider(
  rawName: string,
  riders: RiderRow[],
  year?: number | null,
): MatchOutcome {
  const corrected = applyCorrection(rawName, year);

  const tokens = corrected
    .replace(/[,]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return { kind: "unmatched" };

  const pickedLast = normalize(tokens[tokens.length - 1]);
  const pickedInitial =
    tokens.length > 1 ? normalize(tokens.slice(0, -1).join(" ")) : null;
  if (!pickedLast) return { kind: "unmatched" };

  // 2) Exact: last_name equals, or appears as a complete token of full_name.
  let candidates = riders.filter((r) => {
    if (normalize(r.last_name) === pickedLast) return true;
    return r.full_name.split(/\s+/).map(normalize).some((t) => t === pickedLast);
  });

  // 3) Substring fallback only when exact found nothing (avoids over-matching).
  //    Require the shorter string to be >= 4 chars, otherwise a mangled peloton
  //    entry whose last_name normalizes to "de" would swallow "Demare", etc.
  if (candidates.length === 0) {
    candidates = riders.filter((r) => {
      const ln = normalize(r.last_name);
      if (Math.min(ln.length, pickedLast.length) < 4) return false;
      return ln.includes(pickedLast) || pickedLast.includes(ln);
    });
  }

  if (candidates.length === 0) return { kind: "unmatched" };
  if (candidates.length === 1) return { kind: "matched", rider: candidates[0] };

  // 4) Narrow by first name / initial.
  if (pickedInitial) {
    const narrowed = candidates.filter((r) =>
      firstNameTokens(r, pickedLast).some((t) =>
        pickedInitial.length === 1
          ? t.startsWith(pickedInitial)
          : t === pickedInitial || t.startsWith(pickedInitial),
      ),
    );
    if (narrowed.length === 1) return { kind: "matched", rider: narrowed[0] };
    if (narrowed.length > 0) return { kind: "ambiguous", candidates: narrowed };
  }

  return { kind: "ambiguous", candidates };
}
