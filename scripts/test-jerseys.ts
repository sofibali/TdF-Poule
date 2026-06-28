import { fetchLetourJerseys, fetchLetourJerseyLeaders } from "../lib/scraper/letour";
(async () => {
  // jersey holders after several stages of the live (2025) edition
  for (const stage of [1, 5, 11, 21]) {
    const L = await fetchLetourJerseyLeaders(stage);
    console.log(`stage ${String(stage).padStart(2)}: 🟡 ${L.gc} | 🟢 ${L.points} | 🔴 ${L.mountain} | ⚪ youth=${L.youth}`);
  }
  // full standings depth check for one stage
  const j = await fetchLetourJerseys(21);
  console.log(`\nstage 21 standings depth: gc=${j.gc.length} points=${j.points.length} mountain=${j.mountain.length} youth=${j.youth.length}`);
  console.log("white jersey top 3:", j.youth.slice(0,3).map(r=>`${r.position}.${r.rider}`).join("  "));
})();
