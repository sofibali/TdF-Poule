import { fetchLetourStageWithTTT, fetchLetourJerseys } from "@/lib/scraper/letour";

async function main() {
  const [rows, jerseys] = await Promise.all([
    fetchLetourStageWithTTT(1),
    fetchLetourJerseys(1),
  ]);

  const top3 = rows.filter(r => r.scoring_position !== null && r.scoring_position! <= 3);
  const youthSet = new Set(jerseys.youth.map(r => r.rider.toLowerCase()));

  console.log("=== Stage 1 TTT – Top 3 Teams ===\n");
  for (let rank = 1; rank <= 3; rank++) {
    const teamRiders = top3.filter(r => r.scoring_position === rank);
    const teamName = teamRiders[0]?.pro_team ?? `Team #${rank}`;
    console.log(`\n--- Rank ${rank}: ${teamName} ---`);
    for (const r of teamRiders) {
      const isYouth = youthSet.has(r.rider.toLowerCase());
      console.log(`  ${r.position}. ${r.rider}${isYouth ? "  ★ YOUTH" : ""}`);
    }
  }

  console.log("\n=== Youth (white jersey) classification ===");
  for (const r of jerseys.youth.slice(0, 10)) {
    console.log(`  ${r.position}. ${r.rider}`);
  }
}
main().catch(console.error);
