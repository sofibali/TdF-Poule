import { fetchLetourJerseys, fetchLetourJerseyLeaders, fetchLetourStageJerseys } from "../lib/scraper/letour";
(async () => {
  // Check which stages are currently live
  const stages = [1, 2, 3, 4];
  for (const stage of stages) {
    try {
      const L = await fetchLetourJerseyLeaders(stage);
      console.log(`stage ${String(stage).padStart(2)}: 🟡 ${L.gc ?? "—"} | ⚪ youth=${L.youth ?? "—"}`);
    } catch (e) {
      console.log(`stage ${stage}: error ${e}`);
    }
  }

  // Deep check on stage 1 and 2: what names does the youth standings return?
  for (const stage of [1, 2, 3]) {
    try {
      const j = await fetchLetourJerseys(stage);
      console.log(`\nstage ${stage} youth standings: ${j.youth.length} riders`);
      console.log("  top 5 names:", j.youth.slice(0, 5).map((r) => `${r.position}.${r.rider}`).join("  "));
    } catch (e) {
      console.log(`stage ${stage} jerseys error: ${e}`);
    }
  }

  // Full youth bonus output for stage 1 and 2
  for (const stage of [1, 2, 3]) {
    try {
      const { youthAwards, holders } = await fetchLetourStageJerseys(stage);
      console.log(`\nstage ${stage} youthAwards (${youthAwards.length}):`, youthAwards);
      console.log(`stage ${stage} holders:`, holders);
    } catch (e) {
      console.log(`stage ${stage} fetchLetourStageJerseys error: ${e}`);
    }
  }
})();
