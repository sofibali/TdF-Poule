#!/usr/bin/env tsx
/**
 * Authoritative final General Classification (top 10) for each year that has a
 * pool/teams, sourced from Wikipedia. PCS is Cloudflare-protected and its /gc
 * page scrapes to the wrong table (a final-stage sprint result), so the scraped
 * final_gc was wrong for every year. This writes the correct GC and links each
 * rider to the riders table.
 *
 * Idempotent — safe to re-run. Use it to restore GC if a refresh ever corrupts
 * it (though migration 0016 freezes completed pools to prevent that).
 *
 * Run:  npx tsx scripts/fix-historical-gc.ts
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

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");

// Final GC top 10, position-ordered, per year.
const GC: Record<number, string[]> = {
  2020: ["Tadej Pogačar","Primož Roglič","Richie Porte","Mikel Landa","Miguel Ángel López","Enric Mas","Rigoberto Urán","Nairo Quintana","Adam Yates","Tom Dumoulin"],
  2021: ["Tadej Pogačar","Jonas Vingegaard","Richard Carapaz","Ben O'Connor","Wilco Kelderman","Enric Mas","Alexey Lutsenko","Guillaume Martin","Pello Bilbao","Rigoberto Urán"],
  2022: ["Jonas Vingegaard","Tadej Pogačar","Geraint Thomas","David Gaudu","Aleksandr Vlasov","Romain Bardet","Louis Meintjes","Alexey Lutsenko","Adam Yates","Valentin Madouas"],
  2023: ["Jonas Vingegaard","Tadej Pogačar","Adam Yates","Simon Yates","Carlos Rodríguez","Pello Bilbao","Jai Hindley","Felix Gall","David Gaudu","Guillaume Martin"],
  2024: ["Tadej Pogačar","Jonas Vingegaard","Remco Evenepoel","João Almeida","Mikel Landa","Adam Yates","Carlos Rodríguez","Matteo Jorgenson","Derek Gee","Santiago Buitrago"],
  2025: ["Tadej Pogačar","Jonas Vingegaard","Florian Lipowitz","Oscar Onley","Felix Gall","Tobias Halland Johannessen","Kévin Vauquelin","Primož Roglič","Ben Healy","Jordan Jegat"],
};

async function resolve(name: string, riders: RiderRow[]): Promise<RiderRow | null> {
  const m = matchRider(name, riders);
  if (m.kind === "matched") return m.rider;
  const last = norm(name.split(/\s+/).pop()!);
  const cand = riders.filter(
    (r) => norm(r.full_name).includes(last) || norm(r.last_name).includes(last),
  );
  return cand.length === 1 ? cand[0] : null;
}

async function main() {
  for (const year of Object.keys(GC).map(Number).sort()) {
    const { data: pool } = await sb.from("pools").select("id").eq("year", year).maybeSingle();
    if (!pool) { console.log(`${year}: no pool — skip`); continue; }
    const { data: riders } = await sb
      .from("riders").select("id, full_name, last_name").eq("pool_id", pool.id);
    const rows: { pool_id: string; position: number; rider_id: string; raw_name: string }[] = [];
    const missing: string[] = [];
    for (let i = 0; i < GC[year].length; i++) {
      const r = await resolve(GC[year][i], (riders ?? []) as RiderRow[]);
      if (!r) { missing.push(`#${i + 1} ${GC[year][i]}`); continue; }
      rows.push({ pool_id: pool.id, position: i + 1, rider_id: r.id, raw_name: GC[year][i] });
    }
    await sb.from("final_gc").delete().eq("pool_id", pool.id);
    const { error } = await sb.from("final_gc").insert(rows);
    console.log(
      `${year}: wrote ${rows.length}/10${error ? " ERR:" + error.message : ""}` +
        (missing.length ? `  MISSING: ${missing.join(", ")}` : ""),
    );
  }
  console.log("done");
}
main().catch((e) => { console.error(e); process.exit(1); });
