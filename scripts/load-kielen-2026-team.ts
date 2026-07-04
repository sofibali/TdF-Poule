import { createClient } from "@supabase/supabase-js";
import { matchRider, type RiderRow } from "@/lib/scoring/canonical-match";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const POOL_ID = "8289ed44-ff43-42c0-bb22-83443764a5d1";

const TEAM = {
  player_name: "Kielen",
  name: "Kielen 2026",
  mains: [
    "POGAČAR Tadej",
    "VINGEGAARD Jonas",
    "EVENEPOEL Remco",
    "LIPOWITZ Florian",
    "DEL TORO Isaac",
    "SEIXAS Paul",
    "AYUSO Juan",
    "JOHANNESSEN Tobias Halland",
    "SKJELMOSE Mattias",
    "JORGENSON Matteo",
    "KOOIJ Olav",
    "MERLIER Tim",
    "PEDERSEN Mads",
    "PHILIPSEN Jasper",
    "VAN DER POEL Mathieu",
  ],
  reserves: [
    "PIDCOCK Tom",
    "MARTINEZ Lenny",
    "UIJTDEBROEKS Cian",
  ],
};

async function main() {
  const { data: riders } = await sb
    .from("riders")
    .select("id, full_name, last_name, bib_number")
    .eq("pool_id", POOL_ID);
  const peloton = (riders ?? []) as RiderRow[];

  const { data: existing } = await sb
    .from("teams").select("id").eq("pool_id", POOL_ID).eq("player_name", "Kielen").maybeSingle();
  if (existing) {
    await sb.from("team_riders").delete().eq("team_id", existing.id);
    await sb.from("teams").delete().eq("id", existing.id);
  }

  const { data: team, error: te } = await sb
    .from("teams")
    .insert({ pool_id: POOL_ID, name: TEAM.name, player_name: TEAM.player_name })
    .select("id").single();
  if (te) throw new Error(te.message);
  const teamId = team!.id as string;

  const rows = [
    ...TEAM.mains.map((raw_name, i) => ({
      team_id: teamId, raw_name, is_reserve: false,
      pick_order: i + 1, reserve_order: null, match_status: "unmatched",
    })),
    ...TEAM.reserves.map((raw_name, i) => ({
      team_id: teamId, raw_name, is_reserve: true,
      pick_order: null, reserve_order: i + 1, match_status: "unmatched",
    })),
  ];
  await sb.from("team_riders").insert(rows);

  const { data: picks } = await sb.from("team_riders").select("id, raw_name").eq("team_id", teamId);
  let ok = 0; const fail: string[] = [];
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
