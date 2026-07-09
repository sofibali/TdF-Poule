#!/usr/bin/env tsx
/**
 * Stamps pcs_slug on 2026 riders with their letour.fr path:
 *   "{bib}/{team_slug}/{name_slug}"
 *
 * pcs_slug is repurposed to hold the letour path so we can construct
 * https://www.letour.fr/en/rider/{pcs_slug} without a schema change.
 *
 * Run: npx tsx scripts/stamp-letour-slugs.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";

config({ path: join(__dirname, "..", ".env.local") });
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

async function fetchRiderPaths(): Promise<Map<number, { team_slug: string; name_slug: string }>> {
  const res = await fetch("https://www.letour.fr/en/riders", { headers: { "User-Agent": UA } });
  const html = await res.text();
  const map = new Map<number, { team_slug: string; name_slug: string }>();
  for (const m of html.matchAll(/\/en\/rider\/(\d+)\/([^\/\"]+)\/([^\"\/]+)/g)) {
    const bib = parseInt(m[1], 10);
    if (!map.has(bib)) map.set(bib, { team_slug: m[2], name_slug: m[3] });
  }
  return map;
}

async function main() {
  console.log("Fetching letour.fr start list...");
  const paths = await fetchRiderPaths();
  console.log(`Found ${paths.size} riders on letour.fr`);

  const { data: pool } = await sb.from("pools").select("id").eq("year", 2026).single();
  if (!pool) { console.error("No 2026 pool"); process.exit(1); }

  const { data: riders } = await sb
    .from("riders")
    .select("id, full_name, bib_number")
    .eq("pool_id", pool.id)
    .not("bib_number", "is", null);

  let updated = 0;
  let missed = 0;
  for (const rider of riders ?? []) {
    const entry = paths.get(rider.bib_number as number);
    if (!entry) { console.log(`  No letour path for bib ${rider.bib_number} (${rider.full_name})`); missed++; continue; }
    const letour_path = `${rider.bib_number}/${entry.team_slug}/${entry.name_slug}`;
    const { error } = await sb
      .from("riders")
      .update({ pcs_slug: letour_path })
      .eq("id", rider.id);
    if (error) { console.error(`  Failed ${rider.full_name}:`, error.message); }
    else updated++;
  }
  console.log(`Updated ${updated} riders, missed ${missed}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
