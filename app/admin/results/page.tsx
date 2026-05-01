// Manual override for stage results — used when the PCS scraper misses a name
// or you need to correct a position before scores propagate to the leaderboard.
// TODO (task #5): per-stage editable table, save via Server Action.

export default function AdminResultsPage() {
  return (
    <section>
      <h1 className="text-2xl font-bold">Edit stage results</h1>
      <p className="mt-2 text-slate-600">
        Override scraper output when names don&apos;t match cleanly.
      </p>
      <p className="mt-8 text-xs text-slate-400">
        TODO: stage selector + editable top-10 grid.
      </p>
    </section>
  );
}
