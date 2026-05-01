// Rider name matcher.
//
// Used at upload time: for each raw_name typed in the docx, produce a
// resolution against the year's `riders` table that we write to team_riders.
//
//   matched    — exactly one rider has that last name in the year's peloton
//   ambiguous  — multiple candidates; admin needs to pick one
//   unmatched  — no candidate found; treated as a dropout for scoring
//
// A rider name in the docx is typically just a last name ("Pogačar") or
// "F. Lastname". The peloton has full names. Last-name match handles 90%;
// if there's a first-initial in the raw, we use it to disambiguate.

import type { MatchCandidate, MatchStatus, Rider } from "@/lib/db/types";

export type MatchResult = {
  status: MatchStatus;
  rider_id: string | null;
  candidates: MatchCandidate[];
};

const NORMALIZE_RE = /[\s.\-']/g;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")     // strip diacritics
    .replace(NORMALIZE_RE, "")
    .trim();
}

function tokenize(raw: string): { initial: string | null; last: string } {
  // "T. Pogačar" → { initial: "t", last: "pogacar" }
  // "Tadej Pogačar" → { initial: "tadej", last: "pogacar" }
  // "Pogačar" → { initial: null, last: "pogacar" }
  const parts = raw
    .replace(/[,]/g, " ")
    .split(/\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 1) return { initial: null, last: normalize(parts[0]) };
  const last = normalize(parts[parts.length - 1]);
  const first = parts.slice(0, -1).join(" ");
  return { initial: normalize(first), last };
}

function firstNameOf(rider: Rider): string {
  // Riders are stored "Tadej Pogačar". Everything except last_name is first.
  const full = rider.full_name.trim();
  const last = rider.last_name.trim();
  if (full.toLowerCase().endsWith(last.toLowerCase())) {
    return full.slice(0, full.length - last.length).trim();
  }
  return full;
}

export function matchRider(rawName: string, peloton: Rider[]): MatchResult {
  const { initial, last } = tokenize(rawName);

  // 1) Find everyone in the peloton with the same normalized last name.
  let candidates = peloton.filter((r) => normalize(r.last_name) === last);

  // 2) Last-name fallback: substring match (catches "Van Der Poel" vs "VanderPoel").
  if (candidates.length === 0) {
    candidates = peloton.filter((r) => {
      const n = normalize(r.last_name);
      return n.includes(last) || last.includes(n);
    });
  }

  // 3) If we have a first-name token, narrow further.
  if (candidates.length > 1 && initial) {
    const narrowed = candidates.filter((r) => {
      const f = normalize(firstNameOf(r));
      // exact first-name match OR first-initial match (one char)
      return f === initial || (initial.length === 1 && f.startsWith(initial));
    });
    if (narrowed.length > 0) candidates = narrowed;
  }

  if (candidates.length === 1) {
    return {
      status: "matched",
      rider_id: candidates[0].id,
      candidates: [],
    };
  }

  if (candidates.length === 0) {
    return { status: "unmatched", rider_id: null, candidates: [] };
  }

  // 2+ candidates → ambiguous, store the shortlist for admin to resolve.
  return {
    status: "ambiguous",
    rider_id: null,
    candidates: candidates.map((r) => ({
      rider_id: r.id,
      full_name: r.full_name,
      pro_team: r.pro_team,
    })),
  };
}
