#!/usr/bin/env tsx
/**
 * Probe a NOS teletekst page: dump its decoded text and show how the cycling
 * result parser reads it. Use this during the Tour to (a) find the cycling
 * result/GC page numbers and (b) tune parseCyclingResults in lib/scraper/nos.ts
 * against the real layout.
 *
 *   npx tsx scripts/nos-probe.ts 821          # dump one page
 *   npx tsx scripts/nos-probe.ts scan 800 899 # find cycling pages in a range
 */
import { fetchTeletekstPage, parseCyclingResults } from "../lib/scraper/nos";

const KW = /wielren|ronde van|tour de|etappe|klassement|pogacar|vingegaard|evenepoel|giro|vuelta/i;

async function dump(page: number) {
  const p = await fetchTeletekstPage(page);
  console.log(`=== page ${page} (prev=${p.prevPage} next=${p.nextPage}) ===`);
  p.text.split("\n").forEach((l) => l.trim() && console.log("  " + l.replace(/\s+$/, "")));
  const rows = parseCyclingResults(p.text);
  console.log(`\n--- parser read ${rows.length} result rows ---`);
  rows.forEach((r) => console.log(`  ${String(r.position).padStart(2)}  ${r.rider}`));
}

async function scan(lo: number, hi: number) {
  for (let p = lo; p <= hi; p++) {
    try {
      const { text } = await fetchTeletekstPage(p);
      if (KW.test(text)) {
        const line = text.split("\n").map((l) => l.trim()).find((l) => KW.test(l)) ?? "";
        console.log(`  ${p}: ${line.slice(0, 60)}`);
      }
    } catch {
      /* skip 404s */
    }
  }
}

async function main() {
  const [a, b, c] = process.argv.slice(2);
  if (a === "scan") await scan(parseInt(b || "800", 10), parseInt(c || "899", 10));
  else if (a) await dump(parseInt(a, 10));
  else console.log("usage: nos-probe.ts <page> | nos-probe.ts scan <lo> <hi>");
}
main().catch((e) => { console.error(e); process.exit(1); });
