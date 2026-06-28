#!/usr/bin/env tsx
/** Validate the letour.fr scraper against the live edition (2025 right now). */
import { fetchLetourGc, fetchLetourStage, fetchLetourWithdrawals } from "../lib/scraper/letour";
(async () => {
  const gc = await fetchLetourGc();
  console.log(`GC: ${gc.length} riders. Top 5:`);
  gc.slice(0,5).forEach(r=>console.log(`  ${r.position}. ${r.rider} (${r.pro_team})`));
  const s3 = await fetchLetourStage(3);
  console.log(`\nStage 3: ${s3.length} riders. Top 3:`);
  s3.slice(0,3).forEach(r=>console.log(`  ${r.position}. ${r.rider}`));
  const w = await fetchLetourWithdrawals();
  console.log(`\nWithdrawals: ${w.length}. Sample:`);
  w.slice(0,8).forEach(x=>console.log(`  stage ${x.stage}: ${x.rider} (dropout_after_stage=${x.stage-1})`));
})();
