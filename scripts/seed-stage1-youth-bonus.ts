// Manually seed Stage 1 youth bonus using the actual white jersey standings
// (time-based, 4/3/2 to top-3), overriding the TTT team-based +1 rule.
// Youth standings from letour.fr/racecenter after Stage 1 TTT:
//   1. Juan Ayuso Pesquera  → +4
//   2. Isaac Del Toro Romero → +3
//   3. Davide Piganzoli      → +2

import { createClient } from "@supabase/supabase-js";
import { matchRider, type RiderRow } from "@/lib/scoring/canonical-match";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const POOL_ID = "8289ed44-ff43-42c0-bb22-83443764a5d1";
const STAGE = 1;

const AWARDS = [
  { name: "Juan Ayuso Pesquera",  bonusPoints: 4 },
  { name: "Isaac Del Toro Romero", bonusPoints: 3 },
  { name: "Davide Piganzoli",      bonusPoints: 2 },
];

async function main() {
  const { data: riders } = await sb
    .from("riders")
    .select("id, full_name, last_name, bib_number")
    .eq("pool_id", POOL_ID);
  const peloton = (riders ?? []) as RiderRow[];

  const rows: { pool_id: string; stage: number; rider_id: string; bonus_points: number }[] = [];
  for (const { name, bonusPoints } of AWARDS) {
    const m = matchRider(name, peloton, 2026);
    if (m.kind !== "matched") {
      console.error(`✗ Could not match: ${name} — ${m.kind}`);
      continue;
    }
    console.log(`  ✓ ${name} (#${(m.rider as any).bib_number}) → +${bonusPoints}`);
    rows.push({ pool_id: POOL_ID, stage: STAGE, rider_id: m.rider.id, bonus_points: bonusPoints });
  }

  if (rows.length === 0) {
    console.error("Nothing to insert.");
    process.exit(1);
  }

  // Wipe any existing Stage 1 youth bonus rows first (TTT +1 entries).
  const { error: del } = await sb
    .from("stage_youth_bonus")
    .delete()
    .eq("pool_id", POOL_ID)
    .eq("stage", STAGE);
  if (del) console.error("Delete error:", del.message);

  const { error } = await sb.from("stage_youth_bonus").insert(rows);
  if (error) {
    console.error("Insert error:", error.message);
    process.exit(1);
  }
  console.log(`\nInserted ${rows.length} youth bonus rows for Stage 1.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
