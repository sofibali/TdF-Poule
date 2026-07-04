// Load a 2026 team into Supabase.
// Usage: npx tsx scripts/load-2026-team.ts
//
// Creates the 2026 pool (if missing) then upserts the team + picks.
// Idempotent — safe to re-run.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// ── Team definition ────────────────────────────────────────────────────────
const TEAM = {
  player_name: "Sofia",
  name: "Sofia 2026",
  mains: [
    "POGAČAR Tadej",
    "VINGEGAARD Jonas",
    "DEL TORO Isaac",
    "EVENEPOEL Remco",
    "DE LIE Arnaud",
    "PHILIPSEN Jasper",
    "PIDCOCK Tom",
    "LIPOWITZ Florian",
    "SEIXAS Paul",
    "VAN DER POEL Mathieu",
    "GIRMAY Biniam",
    "AYUSO Juan",
    "JOHANNESSEN Tobias Halland",
    "MERLIER Tim",
    "MARTINEZ Lenny",
  ],
  reserves: [
    "GRÉGOIRE Romain",
    "SKJELMOSE Mattias",
    "ARENSMAN Thymen",
  ],
};

async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  // 1) Ensure 2026 pool exists
  let { data: pool } = await sb
    .from("pools")
    .select("id")
    .eq("year", 2026)
    .maybeSingle();

  if (!pool) {
    const { data: newPool, error } = await sb
      .from("pools")
      .insert({
        year: 2026,
        name: "Tour de France 2026",
        start_date: "2026-07-05",
        num_stages: 21,
        reserves_allowed: 3,
        reserve_lock_stage: 10,
        youth_bonus_points: 4,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Create pool: ${error.message}`);
    pool = newPool;
    console.log("Created 2026 pool:", pool!.id);
  } else {
    console.log("Found 2026 pool:", pool.id);
  }

  const poolId = pool!.id as string;

  // 2) Upsert team
  const { data: existing } = await sb
    .from("teams")
    .select("id")
    .eq("pool_id", poolId)
    .eq("player_name", TEAM.player_name)
    .maybeSingle();

  let teamId: string;
  if (existing) {
    teamId = existing.id;
    console.log("Team already exists:", teamId);
  } else {
    const { data: newTeam, error } = await sb
      .from("teams")
      .insert({ pool_id: poolId, name: TEAM.name, player_name: TEAM.player_name })
      .select("id")
      .single();
    if (error) throw new Error(`Create team: ${error.message}`);
    teamId = newTeam!.id;
    console.log("Created team:", teamId);
  }

  // 3) Clear existing picks (idempotent reset)
  await sb.from("team_riders").delete().eq("team_id", teamId);

  // 4) Insert mains
  const mainRows = TEAM.mains.map((raw_name, i) => ({
    team_id: teamId,
    raw_name,
    is_reserve: false,
    pick_order: i + 1,
    reserve_order: null,
    match_status: "unmatched",
  }));
  const { error: mainErr } = await sb.from("team_riders").insert(mainRows);
  if (mainErr) throw new Error(`Insert mains: ${mainErr.message}`);
  console.log(`Inserted ${mainRows.length} mains`);

  // 5) Insert reserves
  const resRows = TEAM.reserves.map((raw_name, i) => ({
    team_id: teamId,
    raw_name,
    is_reserve: true,
    pick_order: null,
    reserve_order: i + 1,
    match_status: "unmatched",
  }));
  const { error: resErr } = await sb.from("team_riders").insert(resRows);
  if (resErr) throw new Error(`Insert reserves: ${resErr.message}`);
  console.log(`Inserted ${resRows.length} reserves`);

  console.log("\nDone. Run the live refresh to match rider IDs:");
  console.log("  curl -X POST https://<your-app>/api/refresh");
}

main().catch((e) => { console.error(e); process.exit(1); });
