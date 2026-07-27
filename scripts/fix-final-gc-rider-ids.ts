#!/usr/bin/env tsx
/**
 * final_gc.rider_id was corrupted for most rows (172/183 in the 2026 pool) —
 * stale from some earlier bad resolution pass, then permanently "locked in"
 * because every resolver only fills NULL rider_ids and never corrects an
 * existing (wrong) one. v_team_gc_points joins team_active_riders to
 * final_gc BY rider_id, so this silently misattributed GC points to whatever
 * team happened to have picked the wrongly-linked rider, corrupting the real
 * leaderboard totals.
 *
 * This re-resolves every final_gc row's rider_id from its raw_name against
 * the current (correct) riders table, unconditionally overwriting whatever
 * was there before.
 *
 * Run: npx tsx scripts/fix-final-gc-rider-ids.ts
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

async function main() {
  const { data: pool } = await sb.from("pools").select("id, year").eq("year", 2026).single();
  if (!pool) throw new Error("no 2026 pool");

  const { data: riders } = await sb
    .from("riders")
    .select("id, full_name, last_name")
    .eq("pool_id", pool.id);

  const { data: gc } = await sb
    .from("final_gc")
    .select("position, raw_name, rider_id")
    .eq("pool_id", pool.id)
    .order("position");

  let fixed = 0, unchanged = 0, ambiguous: string[] = [], unmatched: string[] = [];
  for (const row of gc ?? []) {
    const m = matchRider(row.raw_name, riders as RiderRow[], pool.year);
    if (m.kind === "matched") {
      if (m.rider.id !== row.rider_id) {
        await sb
          .from("final_gc")
          .update({ rider_id: m.rider.id })
          .eq("pool_id", pool.id)
          .eq("position", row.position);
        fixed++;
      } else {
        unchanged++;
      }
    } else if (m.kind === "ambiguous") {
      ambiguous.push(`#${row.position} ${row.raw_name}`);
    } else {
      unmatched.push(`#${row.position} ${row.raw_name}`);
    }
  }
  console.log(`fixed: ${fixed}, already correct: ${unchanged}`);
  console.log("ambiguous:", ambiguous);
  console.log("unmatched:", unmatched);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
