#!/usr/bin/env tsx
/**
 * Backfill historical stage results (top-10 per stage) from Wikipedia's
 * detailed "<year> Tour de France, Stage X to Stage Y" articles, for years
 * whose stage data is incomplete (PCS/letour can't reach them). GC is handled
 * separately by fix-historical-gc.ts. Idempotent per pool.
 *
 * Run: npx tsx scripts/backfill-historical-stages.ts 2006 2007 2008 2009 2010 2011
 */
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
import { matchRider, type RiderRow } from "../lib/scoring/canonical-match";

config({ path: join(__dirname, "..", ".env.local") });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const fetchHtml = async (u: string) => (await fetch(u, { headers: { "User-Agent": UA } })).text();
const cleanName = (s: string) => s.replace(/\([A-Z]{3}\)/g, "").replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();

async function parseArticle(url: string): Promise<Record<string, string[]>> {
  const $ = cheerio.load(await fetchHtml(url));
  const stages: Record<string, string[]> = {};
  let cur: string | null = null, haveResult = false;
  $("h2,h3,h4,table.wikitable").each((_i, el) => {
    if ((el as { tagName?: string }).tagName === "table") {
      const hdr = $(el).find("tr").first().find("th").map((_, c) => $(c).text().trim()).get().join("|");
      if (!/Rank/i.test(hdr) || !/Rider|Cyclist/i.test(hdr)) return;
      if (cur && !haveResult) {
        const names: string[] = [];
        $(el).find("tr").slice(1).each((_, tr) => {
          const tds = $(tr).find("td"); if (tds.length < 2) return;
          const rank = parseInt($(tds[0]).text().trim(), 10);
          const rider = cleanName($(tds[1]).text());
          if (rank >= 1 && rank <= 10 && rider) names[rank - 1] = rider;
        });
        if (names.filter(Boolean).length >= 3) { stages[cur] = names; haveResult = true; }
      }
    } else {
      const m = $(el).text().replace(/\[edit\]/i, "").trim().match(/^(Prologue|Stage\s+\d+)/i);
      if (m) { cur = m[1].replace(/\s+/g, " "); haveResult = false; }
    }
  });
  return stages;
}

async function articleUrls(year: number): Promise<string[]> {
  const main = await fetchHtml(`https://en.wikipedia.org/wiki/${year}_Tour_de_France`);
  const subs = [...new Set([...main.matchAll(new RegExp(`/wiki/(${year}_Tour_de_France[%2C,_][^"#]*[Ss]tage[^"#]*)"`, "g"))]
    .map((m) => "https://en.wikipedia.org/wiki/" + m[1]))];
  return subs.length ? subs : [`https://en.wikipedia.org/wiki/${year}_Tour_de_France`];
}

function orderKey(label: string): number {
  if (/prologue/i.test(label)) return 0;
  return parseInt(label.replace(/\D/g, ""), 10) || 99;
}

async function main() {
  const years = process.argv.slice(2).map(Number).filter(Boolean);
  for (const year of years) {
    const urls = await articleUrls(year);
    const merged: Record<string, string[]> = {};
    for (const u of urls) Object.assign(merged, await parseArticle(u));
    const ordered = Object.entries(merged).sort((a, b) => orderKey(a[0]) - orderKey(b[0]));
    if (ordered.length < 18) { console.log(`${year}: only ${ordered.length} stages parsed — skipping (check article)`); continue; }

    const { data: pool } = await sb.from("pools").select("id").eq("year", year).maybeSingle();
    if (!pool) { console.log(`${year}: no pool`); continue; }
    const { data: riders } = await sb.from("riders").select("id, full_name, last_name").eq("pool_id", pool.id);
    const peloton = (riders ?? []) as RiderRow[];

    const rows: any[] = []; const unmatched = new Set<string>();
    ordered.forEach(([, names], idx) => {
      const stage = idx + 1; // sequential race day → DB stage 1..21
      names.forEach((name, i) => {
        if (!name) return;
        const m = matchRider(name, peloton);
        if (m.kind !== "matched") unmatched.add(name);
        rows.push({ pool_id: pool.id, stage, position: i + 1, rider_id: m.kind === "matched" ? m.rider.id : null, raw_name: name });
      });
    });
    await sb.from("stage_results").delete().eq("pool_id", pool.id);
    for (let i = 0; i < rows.length; i += 200) await sb.from("stage_results").insert(rows.slice(i, i + 200));
    console.log(`${year}: ${ordered.length} stages, ${rows.length} rows (${rows.filter(r=>r.rider_id).length} linked). winners: ${ordered.slice(0,3).map(([s,n])=>`${s}=${n[0]}`).join(", ")}…${unmatched.size?`  [${unmatched.size} names not in peloton]`:""}`);
  }
  console.log("done");
}
main().catch((e) => { console.error(e); process.exit(1); });
