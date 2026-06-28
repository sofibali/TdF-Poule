#!/usr/bin/env tsx
/**
 * Populate rider_dropouts from cyclingstage.com's per-year withdrawal lists,
 * which give "(DNF|DNS) [in] stage N <bib> <Rider> (country - team)". A rider
 * listed at stage N last FINISHED stage N-1, so dropout_after_stage = N-1.
 * The substitution engine (migration 0017) only replaces mains with
 * dropout_after_stage < 6 (didn't finish stage 6).
 *
 * Idempotent: replaces each pool's rider_dropouts. Re-run to refresh.
 * Run: npx tsx scripts/populate-dropouts.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
import { matchRider, type RiderRow } from "../lib/scoring/canonical-match";

config({ path: join(__dirname, "..", ".env.local") });
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const YEARS = [2020, 2021, 2022, 2023, 2024, 2025];

async function parseWithdrawals(year: number): Promise<{ name: string; stage: number }[]> {
  const html = await (
    await fetch(
      `https://www.cyclingstage.com/tour-de-france-${year}/withdrawals-tdf-${year}/`,
      { headers: { "User-Agent": UA } },
    )
  ).text();
  const blocks = [...html.matchAll(/<(p|li)[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) =>
    m[2].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim(),
  );
  const out: { name: string; stage: number }[] = [];
  for (const b of blocks) {
    const hm = b.match(/^(DNF|DNS|HD|OTL)\s+(?:in\s+)?stage\s+(\d+)\s+(.*)$/i);
    if (!hm) continue;
    const listed = parseInt(hm[2], 10);
    for (const rm of hm[3].matchAll(/\d+\s+(.+?)\s+\([a-z]{2,3}[\s)]/gi)) {
      out.push({ name: rm[1].trim(), stage: listed - 1 });
    }
  }
  return out;
}

async function main() {
  for (const year of YEARS) {
    const wds = await parseWithdrawals(year);
    const { data: pool } = await sb.from("pools").select("id").eq("year", year).maybeSingle();
    if (!pool) continue;
    const { data: riders } = await sb
      .from("riders").select("id, full_name, last_name").eq("pool_id", pool.id);
    const byRider = new Map<string, number>();
    for (const w of wds) {
      const m = matchRider(w.name, (riders ?? []) as RiderRow[]);
      if (m.kind !== "matched") continue;
      const cur = byRider.get(m.rider.id);
      if (cur === undefined || w.stage < cur) byRider.set(m.rider.id, w.stage);
    }
    await sb.from("rider_dropouts").delete().eq("pool_id", pool.id);
    const rows = [...byRider.entries()].map(([rider_id, dropout_after_stage]) => ({
      pool_id: pool.id, rider_id, dropout_after_stage,
    }));
    if (rows.length) {
      const { error } = await sb.from("rider_dropouts").insert(rows);
      if (error) { console.error(`${year}: ${error.message}`); continue; }
    }
    console.log(`${year}: ${wds.length} withdrawals parsed, ${rows.length} matched & written`);
  }
  console.log("done");
}
main().catch((e) => { console.error(e); process.exit(1); });
