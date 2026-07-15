#!/usr/bin/env tsx
/**
 * Re-fixes Arnaud De Lie's dropout record (was cleared from DB).
 * De Lie DNF'd stage 3 → dropout_after_stage = 3 (scraper rule: DNF = stage of abandonment).
 * This means he's "active" for stage 3 (started it) and Hindley (R1) subs in from stage 4.
 *
 * Run: npx tsx scripts/fix-delie-dropout.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
config({ path: join(__dirname, "..", ".env.local") });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const DE_LIE_ID = "6362c5d1-99f1-4015-83af-3d6554126220";

async function main() {
  const { data: pool } = await sb.from("pools").select("id").eq("year", 2026).single();
  const pid = pool!.id;

  const { error } = await sb.from("rider_dropouts").upsert(
    { pool_id: pid, rider_id: DE_LIE_ID, dropout_after_stage: 3, reason: "dnf" },
    { onConflict: "pool_id,rider_id" }
  );
  if (error) { console.error("Upsert failed:", error.message); process.exit(1); }

  const { data: verify } = await sb.from("rider_dropouts")
    .select("dropout_after_stage, reason").eq("pool_id", pid).eq("rider_id", DE_LIE_ID).single();
  console.log("De Lie dropout:", verify);
  console.log("→ Hindley (R1) activates from stage 4 onwards");
}
main().catch(console.error);
