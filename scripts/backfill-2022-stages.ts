#!/usr/bin/env tsx
/**
 * Backfill 2022 Tour stage results. The original PCS scrape only captured 1 of
 * 21 stages, and PCS is now Cloudflare-blocked. Source: bikeraceinfo.com (a
 * static, non-blocked cycling archive), parsed for the per-stage top 10 — which
 * is all that scores. Stages 1 and 13 don't parse cleanly off the page; their
 * top 10s are taken from Wikipedia (verified against the same winners).
 *
 * Idempotent: replaces 2022 stage_results with the top 10 of each stage and
 * links riders via the shared matcher. Run: npx tsx scripts/backfill-2022-stages.ts
 */
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
import { matchRider, type RiderRow } from "../lib/scoring/canonical-match";

config({ path: join(__dirname, "..", ".env.local") });
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const txt = (s: string) => cheerio.load("<x>" + s + "</x>")("x").text().trim();

function blockTop10(seg: string): string[] {
  const rows = [
    ...seg.matchAll(
      /<tr>\s*<td[^>]*>\s*(\d{1,3})\s*<\/td>\s*<td[^>]*>\s*([^<]+?)\s*<\/td>/gi,
    ),
  ];
  const names: string[] = [];
  let prev = 0;
  for (const r of rows) {
    const pos = parseInt(r[1], 10);
    if (pos === 1 && prev >= 1) break; // next table started (GC) — stop
    if (pos >= 1 && pos <= 10) names[pos - 1] = txt(r[2]);
    prev = pos;
  }
  return names;
}

// Stages 1 and 13 (verified top 10 from Wikipedia — bikeraceinfo's tables for
// these two don't parse off the year page).
const MANUAL: Record<number, string[]> = {
  1: ["Yves Lampaert","Wout van Aert","Tadej Pogačar","Filippo Ganna","Mathieu van der Poel","Mads Pedersen","Jonas Vingegaard","Primož Roglič","Bauke Mollema","Dylan Teuns"],
  13: ["Mads Pedersen","Fred Wright","Hugo Houle","Stefan Küng","Matteo Jorgenson","Filippo Ganna","Wout van Aert","Florian Sénéchal","Luca Mozzato","Andrea Pasqualon"],
};

async function main() {
  const html = await (
    await fetch("https://bikeraceinfo.com/tdf/tdf2022.html", {
      headers: { "User-Agent": "Mozilla/5.0" },
    })
  ).text();

  const stages: Record<number, string[]> = { ...MANUAL };

  // Caption-anchored stages (reliable mapping for the ones with a results link).
  const capRe = /(?:complete\s+)?stage\s+(\d+)\s+(?:complete\s+)?results,\s*stage story/gi;
  const anchors: { n: number; idx: number }[] = [];
  for (const m of html.matchAll(capRe)) anchors.push({ n: parseInt(m[1], 10), idx: m.index! });
  anchors.sort((a, b) => a.idx - b.idx);
  for (let i = 0; i < anchors.length; i++) {
    const chunk = html.slice(anchors[i].idx, anchors[i + 1]?.idx ?? html.length);
    const ri = chunk.search(/Results:/i);
    if (ri < 0) continue;
    const names = blockTop10(chunk.slice(ri));
    if (names.filter(Boolean).length >= 8 && !stages[anchors[i].n]) stages[anchors[i].n] = names;
  }
  // Final stage (no caption) = the very first "Results:" block on the page.
  const first = html.search(/Results:/i);
  if (first >= 0) {
    const names = blockTop10(html.slice(first, first + 2500));
    if (names.filter(Boolean).length >= 8 && !stages[21]) stages[21] = names;
  }

  const present = Object.keys(stages).map(Number).sort((a, b) => a - b);
  console.log(`stages assembled: ${present.length} -> ${present.join(",")}`);
  if (present.length !== 21) {
    console.error("Expected 21 stages, aborting."); process.exit(1);
  }

  const { data: pool } = await sb.from("pools").select("id").eq("year", 2022).maybeSingle();
  const pid = pool!.id;
  const { data: riders } = await sb.from("riders").select("id, full_name, last_name").eq("pool_id", pid);

  const rows: { pool_id: string; stage: number; position: number; rider_id: string | null; raw_name: string }[] = [];
  const unmatched = new Set<string>();
  for (const stage of present) {
    stages[stage].forEach((name, i) => {
      if (!name) return;
      const m = matchRider(name, (riders ?? []) as RiderRow[]);
      const rider_id = m.kind === "matched" ? m.rider.id : null;
      if (!rider_id) unmatched.add(name);
      rows.push({ pool_id: pid, stage, position: i + 1, rider_id, raw_name: name });
    });
  }

  await sb.from("stage_results").delete().eq("pool_id", pid);
  // insert in chunks
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from("stage_results").insert(rows.slice(i, i + 200));
    if (error) { console.error("insert error:", error.message); process.exit(1); }
  }
  console.log(`wrote ${rows.length} rows (${rows.filter(r => r.rider_id).length} linked)`);
  if (unmatched.size) console.log(`unmatched names (won't score): ${[...unmatched].join(", ")}`);
  console.log("done");
}
main().catch((e) => { console.error(e); process.exit(1); });
