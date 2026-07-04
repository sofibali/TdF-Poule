import { createClient } from "@supabase/supabase-js";
import { matchRider, type RiderRow } from "@/lib/scoring/canonical-match";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const POOL_ID = "8289ed44-ff43-42c0-bb22-83443764a5d1";

const TEAM = {
  player_name: "Claude-AI",
  name: "Claude-AI 2026",
  mains: [
    "POGAČAR Tadej",        // #1  — GC anchor
    "VINGEGAARD Jonas",     // #11 — GC anchor
    "EVENEPOEL Remco",      // #21 — GC + TT
    "VAN DER POEL Mathieu", // #101 — promoted from R1, opening week stages
    "LIPOWITZ Florian",     // #25 — youth GC
    "GRÉGOIRE Romain",      // #181 — promoted from R2, young hunter
    "HEALY Ben",            // #44 — breakaway specialist
    "DEL TORO Isaac",       // #2  — youth GC at UAE
    "O'CONNOR Ben",         // #111 — GC hunter Jayco
    "ARENSMAN Thymen",      // #82 — Ineos climber
    "PEDERSEN Mads",        // #33 — all-round sprinter Lidl-Trek
    "VAUQUELIN Kevin",      // #88 — young French climber
    "JOHANNESSEN Tobias",   // #121 — youth bonus hunter
    "DE LIE Arnaud",        // #151 — youth sprint bonus
    "JORGENSON Matteo",     // #16 — GC insurance Visma
  ],
  reserves: [
    "HINDLEY Jai",          // #24 — GC backup Red Bull-Bora
    "VAN EETVELT Lennert",  // #156 — young Belgian climber
    "GANNA Filippo",        // #84 — TTT + TT specialist Ineos
  ],
};

async function main() {
  const { data: riders } = await sb
    .from("riders")
    .select("id, full_name, last_name, bib_number")
    .eq("pool_id", POOL_ID);
  const peloton = (riders ?? []) as RiderRow[];

  // Remove existing Claude-AI team if present
  const { data: existing } = await sb
    .from("teams")
    .select("id")
    .eq("pool_id", POOL_ID)
    .eq("player_name", "Claude-AI")
    .maybeSingle();
  if (existing) {
    await sb.from("team_riders").delete().eq("team_id", existing.id);
    await sb.from("teams").delete().eq("id", existing.id);
    console.log("Removed existing Claude-AI team");
  }

  const { data: team, error: te } = await sb
    .from("teams")
    .insert({ pool_id: POOL_ID, name: TEAM.name, player_name: TEAM.player_name })
    .select("id")
    .single();
  if (te) throw new Error(te.message);
  const teamId = team!.id as string;
  console.log("Created team:", teamId);

  const mainRows = TEAM.mains.map((raw_name, i) => ({
    team_id: teamId, raw_name, is_reserve: false,
    pick_order: i + 1, reserve_order: null, match_status: "unmatched",
  }));
  const resRows = TEAM.reserves.map((raw_name, i) => ({
    team_id: teamId, raw_name, is_reserve: true,
    pick_order: null, reserve_order: i + 1, match_status: "unmatched",
  }));
  await sb.from("team_riders").insert([...mainRows, ...resRows]);

  // Resolve immediately using canonical matcher
  const { data: picks } = await sb
    .from("team_riders")
    .select("id, raw_name")
    .eq("team_id", teamId);

  let ok = 0, fail: string[] = [];
  for (const p of picks ?? []) {
    const m = matchRider(p.raw_name as string, peloton, 2026);
    if (m.kind === "matched") {
      await sb.from("team_riders")
        .update({ rider_id: m.rider.id, match_status: "matched", match_candidates: null })
        .eq("id", p.id);
      console.log(`  ✓ ${p.raw_name} → ${m.rider.full_name} (#${(m.rider as any).bib_number})`);
      ok++;
    } else {
      console.log(`  ✗ ${p.raw_name} — ${m.kind}`);
      fail.push(p.raw_name as string);
    }
  }
  console.log(`\nMatched ${ok}/18  Failed: ${fail.length}`);
  if (fail.length) console.log("Unmatched:", fail);
}

main().catch((e) => { console.error(e); process.exit(1); });
