#!/usr/bin/env tsx
/**
 * READ-ONLY diagnostic. For every pool, run the same matcher the app uses and
 * report which picks are ambiguous or unmatched, with the candidate riders.
 * Writes nothing to the DB.
 *
 * Run:  npx tsx scripts/diagnose-ambiguous.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
import { matchRider, type RiderRow } from "../lib/scoring/canonical-match";

config({ path: join(__dirname, "..", ".env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data: pools } = await supabase.from("pools").select("id, year").order("year");
  for (const pool of pools ?? []) {
    const { data: riders } = await supabase
      .from("riders").select("id, full_name, last_name").eq("pool_id", pool.id);
    const { data: teams } = await supabase
      .from("teams").select("id, name, player_name").eq("pool_id", pool.id);
    const teamIds = (teams ?? []).map((t) => t.id);
    const teamById = new Map((teams ?? []).map((t) => [t.id, t]));
    if (!riders?.length || !teamIds.length) {
      console.log(`\n### ${pool.year}: riders=${riders?.length ?? 0} teams=${teamIds.length} — skip`);
      continue;
    }
    const { data: picks } = await supabase
      .from("team_riders").select("team_id, raw_name, is_reserve, match_status").in("team_id", teamIds);

    let amb = 0, unm = 0, matched = 0;
    const lines: string[] = [];
    for (const p of picks ?? []) {
      const r = matchRider(p.raw_name, riders as RiderRow[], pool.year);
      const who = teamById.get(p.team_id);
      const tag = p.is_reserve ? "(res)" : "     ";
      if (r.kind === "ambiguous") {
        amb++;
        const cands = (r as any).candidates.map((c: RiderRow) => c.full_name).join(" | ");
        lines.push(`  AMBIG  ${tag} "${p.raw_name}"  [${who?.player_name}] -> ${cands}`);
      } else if (r.kind === "unmatched") {
        unm++;
        lines.push(`  UNMTCH ${tag} "${p.raw_name}"  [${who?.player_name}]`);
      } else matched++;
    }
    console.log(`\n### ${pool.year}: ${matched} matched, ${amb} ambiguous, ${unm} unmatched  (peloton=${riders.length})`);
    lines.sort().forEach((l) => console.log(l));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
