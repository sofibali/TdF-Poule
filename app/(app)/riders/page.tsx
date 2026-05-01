// "Riders" view — every rider that scored points across the field, with
// stage-by-stage breakdown. Top 15 are highlighted as the "perfect team."

import RidersTable from "@/components/RidersTable";
import YearSelect from "@/components/YearSelect";
import { createClient } from "@/lib/supabase/server";
import type {
  RiderStagePointsRow,
  RiderTotalsRow,
} from "@/lib/db/types";

export const dynamic = "force-dynamic";

export default async function RidersPage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  const supabase = createClient();
  const year =
    parseInt(searchParams.year ?? process.env.TDF_YEAR ?? "2026", 10);

  // Fetch the pool ID for filtering — the views filter by pool_id.
  const { data: pool } = await supabase
    .from("pools")
    .select("id, reserves_allowed")
    .eq("year", year)
    .single();

  const totals: RiderTotalsRow[] = [];
  const perStage: RiderStagePointsRow[] = [];

  if (pool) {
    const [{ data: t }, { data: s }] = await Promise.all([
      supabase
        .from("v_rider_totals")
        .select("*")
        .eq("pool_id", pool.id)
        .order("overall_rank"),
      supabase
        .from("v_rider_stage_points")
        .select("*")
        .eq("pool_id", pool.id),
    ]);
    if (t) totals.push(...(t as RiderTotalsRow[]));
    if (s) perStage.push(...(s as RiderStagePointsRow[]));
  }

  const { data: pools } = await supabase
    .from("pools")
    .select("year")
    .order("year", { ascending: false });
  const years = (pools ?? []).map((p) => p.year as number);

  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Riders</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every rider that scored across {year}, with stage-by-stage
            breakdown. The top 15 represent the perfect retrospective team.
          </p>
        </div>
        {years.length > 0 && <YearSelect years={years} current={year} />}
      </div>

      <div className="mt-6">
        <RidersTable totals={totals} perStage={perStage} perfectTeamSize={15} />
      </div>
    </section>
  );
}
