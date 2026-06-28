#!/usr/bin/env tsx
/**
 * Prove the simulator engine is faithful: score the snapshot under CURRENT_RULES
 * and diff against the live v_leaderboard from the DB. Any mismatch means the
 * TS engine has drifted from the SQL and the simulator can't be trusted.
 *
 * Run:  npx tsx scripts/sim/validate.ts [year]
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { score, CURRENT_RULES, type Snapshot } from "./engine";

config({ path: join(__dirname, "..", "..", ".env.local") });
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const YEAR = Number(process.argv[2] ?? 2025);

async function main() {
  const snap: Snapshot = JSON.parse(
    readFileSync(join(__dirname, "data", `${YEAR}.json`), "utf8"),
  );

  const mine = score(snap, CURRENT_RULES);
  const byId = new Map(mine.map((s) => [s.teamId, s]));

  const { data: live } = await sb
    .from("v_leaderboard")
    .select("team_id, name, total_points, stage_points, gc_points")
    .eq("pool_id", snap.poolId);

  let mismatches = 0;
  console.log(`Validating ${YEAR} engine vs live v_leaderboard\n`);
  console.log("team                     mine(stg/gc/tot)   live(stg/gc/tot)   ok");
  for (const l of (live ?? []).sort((a, b) => b.total_points - a.total_points)) {
    const m = byId.get(l.team_id);
    if (!m) {
      console.log(`${l.name.padEnd(24)} MISSING in engine`);
      mismatches++;
      continue;
    }
    const ok =
      m.stagePoints === l.stage_points &&
      m.gcPoints === l.gc_points &&
      m.total === l.total_points;
    if (!ok) mismatches++;
    console.log(
      `${l.name.slice(0, 24).padEnd(24)} ` +
        `${String(m.stagePoints).padStart(4)}/${String(m.gcPoints).padStart(3)}/${String(m.total).padStart(4)}   ` +
        `${String(l.stage_points).padStart(4)}/${String(l.gc_points).padStart(3)}/${String(l.total_points).padStart(4)}   ` +
        `${ok ? "ok" : "!! MISMATCH"}`,
    );
  }
  console.log(
    `\n${mismatches === 0 ? "PASS — engine matches DB exactly" : `FAIL — ${mismatches} mismatches`}`,
  );
  process.exit(mismatches === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
