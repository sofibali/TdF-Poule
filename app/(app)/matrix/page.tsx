// "All teams · stages" view — every team × every stage, with heat-mapping
// of per-stage top scorer.

import StageMatrix from "@/components/StageMatrix";
import YearSelect from "@/components/YearSelect";
import { createClient } from "@/lib/supabase/server";
import type { TeamStageMatrixRow } from "@/lib/db/types";

export const dynamic = "force-dynamic";

export default async function MatrixPage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  const supabase = createClient();
  const year =
    parseInt(searchParams.year ?? process.env.TDF_YEAR ?? "2026", 10);

  const { data: matrixRows } = await supabase
    .from("v_team_stage_matrix")
    .select("*")
    .eq("year", year);

  // GC totals per team for the rightmost column.
  const { data: gcRows } = await supabase
    .from("v_team_gc_points")
    .select("team_id, points");
  const gcByTeam: Record<string, number> = {};
  for (const r of gcRows ?? []) gcByTeam[r.team_id] = r.points;

  const { data: pools } = await supabase
    .from("pools")
    .select("year")
    .order("year", { ascending: false });
  const years = (pools ?? []).map((p) => p.year as number);

  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            All teams · stages
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Every team&apos;s points across every stage of {year}. Top scorer
            per stage is highlighted in green.
          </p>
        </div>
        {years.length > 0 && <YearSelect years={years} current={year} />}
      </div>

      <div className="mt-6">
        <StageMatrix
          rows={(matrixRows as TeamStageMatrixRow[]) ?? []}
          gcByTeam={gcByTeam}
        />
      </div>
    </section>
  );
}
