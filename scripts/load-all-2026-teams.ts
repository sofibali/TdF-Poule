// Load all 17 official 2026 Tour de France Poule teams from Tour 2026.docx.
// Deletes any existing 2026 teams first, then reloads all.

import { createClient } from "@supabase/supabase-js";
import { matchRider, type RiderRow } from "@/lib/scoring/canonical-match";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const POOL_ID = "8289ed44-ff43-42c0-bb22-83443764a5d1";

const TEAMS: Array<{
  player_name: string;
  name: string;
  mains: string[];
  reserves: string[];
}> = [
  {
    player_name: "Coert",
    name: "Coert's Hit it this Time",
    mains: ["POGACAR Tadej", "VINGEGAARD Jonas", "LIPOWITZ Florian", "SEIXAS Paul",
      "DEL TORO Isaac", "EVENEPOEL Remco", "VAUQUELIN Kevin", "AYUSO Juan",
      "PIDCOCK Tom", "HEALY Ben", "VAN DER POEL Mathieu", "ARENSMAN Thymen",
      "PHILIPSEN Jasper", "PEDERSEN Mads", "MERLIER Tim"],
    reserves: ["JORGENSON Matteo", "MARTINEZ Lenny", "KOOIJ Olav"],
  },
  {
    player_name: "Chiel",
    name: "Chiel's Home run",
    mains: ["POGACAR Tadej", "VINGEGAARD Jonas", "LIPOWITZ Florian", "SEIXAS Paul",
      "DEL TORO Isaac", "EVENEPOEL Remco", "VAUQUELIN Kevin", "AYUSO Juan",
      "MARTINEZ Lenny", "UIJTDEBROEKS Cian", "VAN DER POEL Mathieu", "GIRMAY Biniam",
      "PHILIPSEN Jasper", "PEDERSEN Mads", "MERLIER Tim"],
    reserves: ["ARENSMAN Thymen", "HINDLEY Jai", "YATES Adam"],
  },
  {
    player_name: "Kielen",
    name: "Kielen's Happily Married",
    mains: ["POGACAR Tadej", "VINGEGAARD Jonas", "LIPOWITZ Florian", "SEIXAS Paul",
      "DEL TORO Isaac", "EVENEPOEL Remco", "JOHANNESSEN Tobias Halland", "AYUSO Juan",
      "SKJELMOSE Mattias", "JORGENSON Matteo", "VAN DER POEL Mathieu", "KOOIJ Olav",
      "PHILIPSEN Jasper", "PEDERSEN Mads", "MERLIER Tim"],
    reserves: ["PIDCOCK Tom", "MARTINEZ Lenny", "UIJTDEBROEKS Cian"],
  },
  {
    player_name: "Quinten",
    name: "Quinten's In the Rabbit hole",
    mains: ["POGACAR Tadej", "VINGEGAARD Jonas", "LIPOWITZ Florian", "SEIXAS Paul",
      "DEL TORO Isaac", "EVENEPOEL Remco", "VAUQUELIN Kevin", "AYUSO Juan",
      "PIDCOCK Tom", "JOHANNESSEN Tobias Halland", "VAN DER POEL Mathieu", "KOOIJ Olav",
      "PHILIPSEN Jasper", "PEDERSEN Mads", "MERLIER Tim"],
    reserves: ["MARTINEZ Lenny", "UIJTDEBROEKS Cian", "TIBERI Antonio"],
  },
  {
    player_name: "Lori",
    name: "Lori's Taking a Gamble",
    mains: ["POGACAR Tadej", "VINGEGAARD Jonas", "LIPOWITZ Florian", "SEIXAS Paul",
      "DEL TORO Isaac", "MARTINEZ Lenny", "VAUQUELIN Kevin", "AYUSO Juan",
      "VAN DER POEL Mathieu", "HEALY Ben", "KOOIJ Olav", "GIRMAY Biniam",
      "PHILIPSEN Jasper", "PEDERSEN Mads", "DE LIE Arnaud"],
    reserves: ["EVENEPOEL Remco", "YATES Adam", "UIJTDEBROEKS Cian"],
  },
  {
    player_name: "Rich",
    name: "Rich's Moving up",
    mains: ["POGACAR Tadej", "VINGEGAARD Jonas", "LIPOWITZ Florian", "SEIXAS Paul",
      "DEL TORO Isaac", "EVENEPOEL Remco", "JOHANNESSEN Tobias Halland", "AYUSO Juan",
      "CARAPAZ Richard", "WRIGHT Fred", "VAN DER POEL Mathieu", "UIJTDEBROEKS Cian",
      "PHILIPSEN Jasper", "KOOIJ Olav", "MERLIER Tim"],
    reserves: ["GIRMAY Biniam", "PEDERSEN Mads", "VAUQUELIN Kevin"],
  },
  {
    player_name: "Hubert",
    name: "Hubert's Due for a win",
    mains: ["POGACAR Tadej", "VINGEGAARD Jonas", "LIPOWITZ Florian", "SEIXAS Paul",
      "DEL TORO Isaac", "EVENEPOEL Remco", "MARTINEZ Lenny", "AYUSO Juan",
      "UIJTDEBROEKS Cian", "CARAPAZ Richard", "VAN DER POEL Mathieu", "KOOIJ Olav",
      "PHILIPSEN Jasper", "PEDERSEN Mads", "MERLIER Tim"],
    reserves: ["JOHANNESSEN Tobias Halland", "PIGANZOLI Davide", "VAUQUELIN Kevin"],
  },
  {
    player_name: "Karin",
    name: "Karin's On Top of it",
    mains: ["POGACAR Tadej", "VINGEGAARD Jonas", "LIPOWITZ Florian", "SEIXAS Paul",
      "DEL TORO Isaac", "EVENEPOEL Remco", "JOHANNESSEN Tobias Halland", "AYUSO Juan",
      "SKJELMOSE Mattias", "MARTINEZ Lenny", "VAN DER POEL Mathieu", "KOOIJ Olav",
      "PHILIPSEN Jasper", "PEDERSEN Mads", "MERLIER Tim"],
    reserves: ["GREGOIRE Romain", "CARAPAZ Richard", "RICCITELLO Matthew"],
  },
  {
    player_name: "Sofia",
    name: "Sofia's Excited",
    mains: ["POGACAR Tadej", "VINGEGAARD Jonas", "LIPOWITZ Florian", "SEIXAS Paul",
      "DEL TORO Isaac", "EVENEPOEL Remco", "JOHANNESSEN Tobias Halland", "AYUSO Juan",
      "PIDCOCK Tom", "MARTINEZ Lenny", "VAN DER POEL Mathieu", "GIRMAY Biniam",
      "PHILIPSEN Jasper", "DE LIE Arnaud", "MERLIER Tim"],
    reserves: ["GREGOIRE Romain", "SKJELMOSE Mattias", "ARENSMAN Thymen"],
  },
  {
    player_name: "Gerards",
    name: "Gerards's The Lucky Ones",
    mains: ["POGACAR Tadej", "VINGEGAARD Jonas", "LIPOWITZ Florian", "SEIXAS Paul",
      "DEL TORO Isaac", "EVENEPOEL Remco", "JOHANNESSEN Tobias Halland", "MARTINEZ Lenny",
      "PIDCOCK Tom", "GIRMAY Biniam", "VAN DER POEL Mathieu", "ARENSMAN Thymen",
      "PHILIPSEN Jasper", "PEDERSEN Mads", "KOOIJ Olav"],
    reserves: ["MERLIER Tim", "ROGLIC Primoz", "CARAPAZ Richard"],
  },
  {
    player_name: "Eelco",
    name: "Eelco's Select Selectie",
    mains: ["POGACAR Tadej", "VINGEGAARD Jonas", "LIPOWITZ Florian", "SEIXAS Paul",
      "DEL TORO Isaac", "EVENEPOEL Remco", "JOHANNESSEN Tobias Halland", "AYUSO Juan",
      "CARAPAZ Richard", "KOOIJ Olav", "VAN DER POEL Mathieu", "GIRMAY Biniam",
      "PHILIPSEN Jasper", "PEDERSEN Mads", "MERLIER Tim"],
    reserves: ["PIDCOCK Tom", "KANTER Tom", "UIJTDEBROEKS Cian"],
  },
  {
    player_name: "Han",
    name: "Han's Go with the Flow",
    mains: ["POGACAR Tadej", "VINGEGAARD Jonas", "LIPOWITZ Florian", "SEIXAS Paul",
      "DEL TORO Isaac", "EVENEPOEL Remco", "VAUQUELIN Kevin", "AYUSO Juan",
      "MEEUS Jordi", "DE LIE Arnaud", "VAN DER POEL Mathieu", "GIRMAY Biniam",
      "PHILIPSEN Jasper", "KOOIJ Olav", "MERLIER Tim"],
    reserves: ["RODRIGUEZ Carlos", "PIDCOCK Tom", "TIBERI Antonio"],
  },
  {
    player_name: "Rein",
    name: "Rein's Klim Geit",
    mains: ["POGACAR Tadej", "VINGEGAARD Jonas", "CARAPAZ Richard", "SEIXAS Paul",
      "DEL TORO Isaac", "EVENEPOEL Remco", "PIGANZOLI Davide", "AYUSO Juan",
      "HEALY Ben", "PARET PEINTRE Aurelien", "ARENSMAN Thymen", "GIRMAY Biniam",
      "PHILIPSEN Jasper", "KOOIJ Olav", "MERLIER Tim"],
    reserves: ["MARTINEZ Lenny", "STORER Michael"],
  },
  {
    player_name: "Bas Oud",
    name: "Bas Oud's Strava beest",
    mains: ["POGACAR Tadej", "VINGEGAARD Jonas", "LIPOWITZ Florian", "SEIXAS Paul",
      "DEL TORO Isaac", "EVENEPOEL Remco", "VAUQUELIN Kevin", "AYUSO Juan",
      "FRETIN Nicolas", "DE LIE Arnaud", "GIRMAY Biniam", "KOOIJ Olav",
      "PHILIPSEN Jasper", "PEDERSEN Mads", "MERLIER Tim"],
    reserves: ["PIDCOCK Tom", "CARAPAZ Richard", "ARENSMAN Thymen"],
  },
  {
    player_name: "Bas Ot",
    name: "Bas Ot's Nieuw jaar, Nieuwe kansen",
    mains: ["POGACAR Tadej", "VINGEGAARD Jonas", "LIPOWITZ Florian", "SEIXAS Paul",
      "DEL TORO Isaac", "EVENEPOEL Remco", "JOHANNESSEN Tobias Halland", "AYUSO Juan",
      "MOHORIC Matej", "VAN DER POEL Mathieu", "GIRMAY Biniam", "KOOIJ Olav",
      "PHILIPSEN Jasper", "PEDERSEN Mads", "MERLIER Tim"],
    reserves: ["CARAPAZ Richard", "VAUQUELIN Kevin", "BERNAL Egan"],
  },
  {
    player_name: "Copilot",
    name: "Co-pilot AI from Microsoft",
    mains: ["POGACAR Tadej", "VINGEGAARD Jonas", "LIPOWITZ Florian", "SEIXAS Paul",
      "DEL TORO Isaac", "EVENEPOEL Remco", "VAUQUELIN Kevin", "AYUSO Juan",
      "MARTINEZ Lenny", "HEALY Ben", "VAN DER POEL Mathieu", "KOOIJ Olav",
      "PHILIPSEN Jasper", "PEDERSEN Mads", "MERLIER Tim"],
    reserves: ["TIBERI Antonio", "JORGENSON Matteo", "MATTHEWS Michael"],
  },
  {
    player_name: "Claude-AI",
    name: "Claude's 2nd Try from Anthropic",
    mains: ["POGACAR Tadej", "VINGEGAARD Jonas", "LIPOWITZ Florian", "O'CONNOR Ben",
      "DEL TORO Isaac", "EVENEPOEL Remco", "JOHANNESSEN Tobias Halland", "JORGENSON Matteo",
      "VAUQUELIN Kevin", "ARENSMAN Thymen", "VAN DER POEL Mathieu", "HEALY Ben",
      "GREGOIRE Romain", "PEDERSEN Mads", "DE LIE Arnaud"],
    reserves: ["HINDLEY Jai", "VAN EETVELT Lennert", "GANNA Filippo"],
  },
];

async function main() {
  const { data: riders } = await sb
    .from("riders")
    .select("id, full_name, last_name, bib_number")
    .eq("pool_id", POOL_ID);
  const peloton = (riders ?? []) as RiderRow[];
  console.log(`Loaded ${peloton.length} riders from pool.\n`);

  // Delete all existing 2026 teams.
  const { data: existingTeams } = await sb
    .from("teams").select("id").eq("pool_id", POOL_ID);
  const ids = (existingTeams ?? []).map((t: { id: string }) => t.id);
  if (ids.length) {
    await sb.from("team_riders").delete().in("team_id", ids);
    await sb.from("teams").delete().eq("pool_id", POOL_ID);
    console.log(`Deleted ${ids.length} existing teams.\n`);
  }

  let totalOk = 0; let totalFail = 0;
  const allFails: string[] = [];

  for (const team of TEAMS) {
    const { data: t, error: te } = await sb
      .from("teams")
      .insert({ pool_id: POOL_ID, name: team.name, player_name: team.player_name })
      .select("id").single();
    if (te) { console.error(`  ✗ Create team ${team.name}: ${te.message}`); continue; }
    const teamId = t!.id as string;

    const allPicks = [
      ...team.mains.map((raw_name, i) => ({
        team_id: teamId, raw_name, is_reserve: false,
        pick_order: i + 1, reserve_order: null, match_status: "unmatched",
      })),
      ...team.reserves.map((raw_name, i) => ({
        team_id: teamId, raw_name, is_reserve: true,
        pick_order: null, reserve_order: i + 1, match_status: "unmatched",
      })),
    ];
    await sb.from("team_riders").insert(allPicks);

    const { data: picks } = await sb.from("team_riders").select("id, raw_name").eq("team_id", teamId);
    let ok = 0; const fail: string[] = [];
    for (const p of picks ?? []) {
      const m = matchRider(p.raw_name as string, peloton, 2026);
      if (m.kind === "matched") {
        await sb.from("team_riders")
          .update({ rider_id: m.rider.id, match_status: "matched", match_candidates: null })
          .eq("id", p.id);
        ok++;
      } else {
        fail.push(`  ${p.raw_name} (${m.kind})`);
      }
    }

    const total = team.mains.length + team.reserves.length;
    const status = fail.length === 0 ? "✓" : "⚠";
    console.log(`${status} ${team.name} — ${ok}/${total} matched`);
    if (fail.length) fail.forEach(f => console.log(`    ✗ ${f.trim()}`));
    totalOk += ok; totalFail += fail.length;
    allFails.push(...fail.map(f => `${team.player_name}: ${f.trim()}`));
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Teams loaded: ${TEAMS.length}`);
  console.log(`Picks matched: ${totalOk}  Failed: ${totalFail}`);
  if (allFails.length) {
    console.log(`\nUnmatched picks:`);
    allFails.forEach(f => console.log(`  ${f}`));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
