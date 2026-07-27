#!/usr/bin/env tsx
/**
 * One-off repair for the stage-21 GC bleed-through bug: letour.fr's
 * /rankings/stage-21 page defaulted to the overall GC table instead of the
 * real stage result, so stage_results + stage_youth_bonus for stage 21 got
 * populated with GC data. lib/scraper/letour.ts now fetches the correct
 * "ite" stage classification directly; this clears the corrupted stage-21
 * rows and re-runs the live refresh to repopulate them correctly.
 *
 * Run: npx tsx scripts/fix-stage21-bleed.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";
import { refreshLive } from "../lib/scraper/live-refresh";

config({ path: join(__dirname, "..", ".env.local") });
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data: pool } = await sb.from("pools").select("id, year").eq("year", 2026).single();
  if (!pool) throw new Error("no 2026 pool");

  const { error: delStage } = await sb
    .from("stage_results")
    .delete()
    .eq("pool_id", pool.id)
    .eq("stage", 21);
  console.log("cleared stage_results stage 21:", delStage?.message ?? "ok");

  const { error: delBonus } = await sb
    .from("stage_youth_bonus")
    .delete()
    .eq("pool_id", pool.id)
    .eq("stage", 21);
  console.log("cleared stage_youth_bonus stage 21:", delBonus?.message ?? "ok");

  const summary = await refreshLive(sb, 2026);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
