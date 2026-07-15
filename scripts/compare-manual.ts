#!/usr/bin/env tsx
/**
 * Compares DB leaderboard vs manual hand-count, and shows which teams
 * have the stage-5 youth-bonus riders (Kooij 4, Artz 3, Fretin 2).
 * Run: npx tsx scripts/compare-manual.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";

config({ path: join(__dirname, "..", ".env.local") });
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const MANUAL: Record<string, number> = {
  "Karin": 386,
  "Eelco": 383,
  "Kielen": 377,
  "Quinten": 374,
  "Hubert": 372,
  "Bas Ot": 371,
  "Bas Oud": 368,
  "Copilot": 365,
  "Han": 338,
  "Lori": 336,
  "Coert": 335,
  "Sofia": 333,
  "Claude-AI": 323,
  // combined entries from user — skipping "Gerard en Chiel" and "Rich en Rein"
};

async function main() {
  const { data: pool } = await sb.from("pools").select("id").eq("year", 2026).single();
  if (!pool) { console.error("No 2026 pool"); process.exit(1); }

  // Stage 5 youth bonus riders
  const { data: bonuses5 } = await sb
    .from("stage_youth_bonus")
    .select("rider_id, bonus_points")
    .eq("pool_id", pool.id)
    .eq("stage", 5);
  const stage5BonusMap = new Map((bonuses5 ?? []).map((b) => [b.rider_id, b.bonus_points]));

  // Which teams have these riders
  const youthRiderIds = [...stage5BonusMap.keys()];
  const { data: picksWithYouth } = await sb
    .from("team_riders")
    .select("team_id, rider_id, raw_name")
    .in("rider_id", youthRiderIds);
  const { data: riders5 } = await sb
    .from("riders")
    .select("id, full_name")
    .in("id", youthRiderIds);
  const nameMap = new Map((riders5 ?? []).map((r) => [r.id, r.full_name]));

  const teamYouthBonus = new Map<string, string[]>();
  for (const p of picksWithYouth ?? []) {
    const bonus = stage5BonusMap.get(p.rider_id);
    if (bonus) {
      const arr = teamYouthBonus.get(p.team_id) ?? [];
      arr.push(`${nameMap.get(p.rider_id) ?? p.raw_name} (+${bonus})`);
      teamYouthBonus.set(p.team_id, arr);
    }
  }

  // Leaderboard
  const { data: lb } = await sb
    .from("v_leaderboard")
    .select("rank, team_id, name, player_name, total_points")
    .eq("year", 2026)
    .order("rank");

  console.log("\nDB vs Manual — after stage 5 youth bonus fix");
  console.log("─".repeat(80));
  console.log(
    "Rank  Player        DB    Manual  Diff   Stage5 youth bonus on team"
  );
  console.log("─".repeat(80));

  for (const r of lb ?? []) {
    const player = r.player_name.split(" ")[0];
    const manualKey = Object.keys(MANUAL).find((k) =>
      r.player_name.toLowerCase().includes(k.toLowerCase()) ||
      r.name.toLowerCase().includes(k.toLowerCase())
    );
    const manual = manualKey ? MANUAL[manualKey] : null;
    const diff = manual != null ? r.total_points - manual : null;
    const youth = teamYouthBonus.get(r.team_id)?.join(", ") ?? "—";
    const diffStr = diff != null ? (diff >= 0 ? `+${diff}` : `${diff}`) : "?";
    console.log(
      `#${String(r.rank).padEnd(4)} ${player.padEnd(12)} ${String(r.total_points).padEnd(6)} ${manual != null ? String(manual).padEnd(6) : "?     "} ${diffStr.padEnd(6)} ${youth}`
    );
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
