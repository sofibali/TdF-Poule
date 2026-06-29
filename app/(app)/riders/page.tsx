import RidersTable from "@/components/RidersTable";
import YearSelect from "@/components/YearSelect";
import { createClient } from "@/lib/supabase/server";
import { yearsWithResults } from "@/lib/db/years";
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

  const years = await yearsWithResults(supabase);

  const { data: defaultYearRpc } = await supabase.rpc(
    "most_recent_year_with_teams",
  );
  const year = searchParams.year
    ? parseInt(searchParams.year, 10)
    : (defaultYearRpc as number | null) ??
      years[0] ??
      parseInt(process.env.TDF_YEAR ?? "2026", 10);

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

  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Riders
          </h1>
          <p className="mt-1 text-sm text-amber-800/60">
            Every rider that scored in {year}. Green = the dream team
            you wish you&apos;d picked.
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
