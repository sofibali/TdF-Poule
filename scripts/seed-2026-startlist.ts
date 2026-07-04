// Seed the 2026 riders table from the official letour.fr/en/riders start list.
//
// Populates: full_name, last_name, bib_number, pro_team (official team name),
//            pcs_slug (set to team_slug for TTT matching).
//
// The bib_number is the single source of truth for "which rider is this" —
// no ambiguity between e.g. "Del Toro" and another rider with a similar name.
// The team_slug (stored in pcs_slug) lets us expand TTT team results into
// individual rider rows.
//
// Usage: npx tsx scripts/seed-2026-startlist.ts
// Safe to re-run — upserts on (pool_id, full_name).

import { createClient } from "@supabase/supabase-js";
import { fetchLetourStartList } from "@/lib/scraper/letour";
import { lastNameOf } from "@/lib/scraper/pcs";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  console.log("Fetching start list from letour.fr/en/riders…");
  const starters = await fetchLetourStartList();
  console.log(`  ${starters.length} riders found`);

  // Print the start list for verification
  let currentTeam = "";
  for (const r of starters) {
    if (r.team_name !== currentTeam) {
      currentTeam = r.team_name;
      console.log(`\n  ${currentTeam}`);
    }
    console.log(`    ${r.bib.toString().padStart(3)}  ${r.full_name}`);
  }

  const { data: pool } = await sb
    .from("pools")
    .select("id")
    .eq("year", 2026)
    .maybeSingle();
  if (!pool) {
    console.error("No 2026 pool found — run load-2026-team.ts first");
    process.exit(1);
  }

  // Upsert all riders: set bib_number, pro_team, and pcs_slug=team_slug.
  // Use full_name as the unique key (same as live-refresh).
  const rows = starters.map((r) => ({
    pool_id: pool.id,
    full_name: r.full_name,
    last_name: lastNameOf(r.full_name),
    bib_number: r.bib,
    pro_team: r.team_name,
    pcs_slug: r.team_slug, // repurposed as letour team slug for TTT lookup
  }));

  const { error } = await sb
    .from("riders")
    .upsert(rows, { onConflict: "pool_id,full_name" });
  if (error) throw new Error(`Upsert riders: ${error.message}`);

  console.log(`\nSeeded ${rows.length} riders into 2026 pool (${pool.id})`);

  // Now resolve team_riders picks against the seeded riders
  const { data: teams } = await sb.from("teams").select("id").eq("pool_id", pool.id);
  const teamIds = (teams ?? []).map((t: { id: string }) => t.id);

  const { data: picks } = await sb
    .from("team_riders")
    .select("id, raw_name")
    .in("team_id", teamIds)
    .in("match_status", ["unmatched", "ambiguous"]);

  // Build lookup maps: bib-number (if pick is "LASTNAME Firstname 1")
  // and by name for fuzzy matching
  const byBib = new Map(starters.map((r) => [r.bib, r]));
  const byName = new Map(starters.map((r) => [r.full_name.toLowerCase(), r]));
  const byLastName = new Map(starters.map((r) => [r.last_name.toLowerCase(), r]));

  // Also build riders id lookup from DB
  const { data: dbRiders } = await sb
    .from("riders")
    .select("id, full_name, bib_number")
    .eq("pool_id", pool.id);
  const ridersById = new Map(
    (dbRiders ?? []).map((r: { id: string; full_name: string; bib_number: number | null }) => [
      r.full_name.toLowerCase(),
      r,
    ]),
  );
  const ridersByBib = new Map(
    (dbRiders ?? [])
      .filter((r: { bib_number: number | null }) => r.bib_number != null)
      .map((r: { id: string; full_name: string; bib_number: number | null }) => [r.bib_number!, r]),
  );

  let resolved = 0;
  for (const pick of picks ?? []) {
    const raw = pick.raw_name as string;

    // Try exact match (normalised)
    const nameLower = raw.toLowerCase().replace(/[^\w\s]/g, "").trim();
    let match =
      ridersById.get(raw.toLowerCase()) ??
      byName.get(nameLower);

    // Try last-name match (e.g. "POGAČAR Tadej" → last token "Tadej", first "POGAČAR")
    if (!match) {
      const parts = raw.split(/\s+/);
      // Format: "LASTNAME Firstname" — first word is last name in caps
      const candidateLastName = parts[0]?.toLowerCase().replace(/[^\w]/g, "");
      const entry = [...byLastName.entries()].find(([k]) =>
        k.replace(/[^\w]/g, "") === candidateLastName
      );
      if (entry) match = ridersById.get(entry[1].full_name.toLowerCase());
    }

    if (!match) continue;

    const dbRider = ridersByBib.get((match as any).bib_number ?? 0) ??
      ridersById.get(match.full_name.toLowerCase());
    if (!dbRider) continue;

    await sb
      .from("team_riders")
      .update({ rider_id: dbRider.id, match_status: "matched", match_candidates: null })
      .eq("id", pick.id);
    console.log(`  Matched: "${raw}" → ${dbRider.full_name} (#${dbRider.bib_number})`);
    resolved++;
  }
  console.log(`\nResolved ${resolved}/${(picks ?? []).length} team picks`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
