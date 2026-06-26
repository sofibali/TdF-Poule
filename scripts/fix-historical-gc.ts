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

// Final GC top 10, position-ordered, per year. 2000-2019 use as-raced standings
// (DQ-adjusted winners where the official result changed: 2006 Pereiro, 2010
// Schleck). 2001-2005 list Armstrong as he finished on the road, though his
// results were later vacated.
const GC: Record<number, string[]> = {
  2000: ["Lance Armstrong","Jan Ullrich","Joseba Beloki","Christophe Moreau","Roberto Heras","Richard Virenque","Santiago Botero","Fernando Escartín","Francisco Mancebo","Daniele Nardello"],
  2001: ["Lance Armstrong","Jan Ullrich","Joseba Beloki","Andrei Kivilev","Igor González","François Simon","Óscar Sevilla","Santiago Botero","Marcos Antonio Serrano","Michael Boogerd"],
  2002: ["Lance Armstrong","Joseba Beloki","Raimondas Rumšas","Santiago Botero","Igor González","José Azevedo","Francisco Mancebo","Levi Leipheimer","Roberto Heras","Carlos Sastre"],
  2003: ["Lance Armstrong","Jan Ullrich","Alexandr Vinokurov","Tyler Hamilton","Haimar Zubeldia","Iban Mayo","Ivan Basso","Christophe Moreau","Carlos Sastre","Francisco Mancebo"],
  2004: ["Lance Armstrong","Andreas Klöden","Ivan Basso","Jan Ullrich","José Azevedo","Francisco Mancebo","Georg Totschnig","Carlos Sastre","Levi Leipheimer","Óscar Pereiro"],
  2005: ["Lance Armstrong","Ivan Basso","Jan Ullrich","Francisco Mancebo","Alexandr Vinokurov","Levi Leipheimer","Michael Rasmussen","Cadel Evans","Floyd Landis","Óscar Pereiro"],
  2006: ["Óscar Pereiro","Andreas Klöden","Carlos Sastre","Cadel Evans","Denis Menchov","Cyril Dessel","Christophe Moreau","Haimar Zubeldia","Michael Rogers","Fränk Schleck"],
  2007: ["Alberto Contador","Cadel Evans","Levi Leipheimer","Carlos Sastre","Haimar Zubeldia","Alejandro Valverde","Kim Kirchen","Yaroslav Popovych","Mikel Astarloza","Óscar Pereiro"],
  2008: ["Carlos Sastre","Cadel Evans","Denis Menchov","Christian Vande Velde","Fränk Schleck","Samuel Sánchez","Kim Kirchen","Alejandro Valverde","Tadej Valjavec","Vladimir Efimkin"],
  2009: ["Alberto Contador","Andy Schleck","Bradley Wiggins","Fränk Schleck","Andreas Klöden","Vincenzo Nibali","Christian Vande Velde","Roman Kreuziger","Christophe Le Mével","Sandy Casar"],
  2010: ["Andy Schleck","Denis Menchov","Samuel Sánchez","Jurgen Van den Broeck","Robert Gesink","Ryder Hesjedal","Joaquim Rodríguez","Roman Kreuziger","Chris Horner","Luis León Sánchez"],
  2011: ["Cadel Evans","Andy Schleck","Fränk Schleck","Thomas Voeckler","Samuel Sánchez","Damiano Cunego","Ivan Basso","Tom Danielson","Jean-Christophe Péraud","Pierre Rolland"],
  2012: ["Bradley Wiggins","Chris Froome","Vincenzo Nibali","Jurgen Van den Broeck","Tejay van Garderen","Haimar Zubeldia","Cadel Evans","Pierre Rolland","Janez Brajkovič","Thibaut Pinot"],
  2013: ["Chris Froome","Nairo Quintana","Joaquim Rodríguez","Alberto Contador","Roman Kreuziger","Bauke Mollema","Jakob Fuglsang","Alejandro Valverde","Daniel Navarro","Andrew Talansky"],
  2014: ["Vincenzo Nibali","Jean-Christophe Péraud","Thibaut Pinot","Alejandro Valverde","Tejay van Garderen","Romain Bardet","Leopold König","Haimar Zubeldia","Laurens ten Dam","Bauke Mollema"],
  2015: ["Chris Froome","Nairo Quintana","Alejandro Valverde","Vincenzo Nibali","Alberto Contador","Robert Gesink","Bauke Mollema","Mathias Frank","Romain Bardet","Pierre Rolland"],
  2016: ["Chris Froome","Romain Bardet","Nairo Quintana","Adam Yates","Richie Porte","Alejandro Valverde","Joaquim Rodríguez","Louis Meintjes","Dan Martin","Roman Kreuziger"],
  2017: ["Chris Froome","Rigoberto Urán","Romain Bardet","Mikel Landa","Fabio Aru","Dan Martin","Simon Yates","Louis Meintjes","Alberto Contador","Warren Barguil"],
  2018: ["Geraint Thomas","Tom Dumoulin","Chris Froome","Primož Roglič","Steven Kruijswijk","Romain Bardet","Mikel Landa","Dan Martin","Ilnur Zakarin","Nairo Quintana"],
  2019: ["Egan Bernal","Geraint Thomas","Steven Kruijswijk","Emanuel Buchmann","Julian Alaphilippe","Mikel Landa","Rigoberto Urán","Nairo Quintana","Alejandro Valverde","Warren Barguil"],
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
