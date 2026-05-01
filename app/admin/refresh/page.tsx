// On-demand "fetch latest stage results from PCS" trigger.
// TODO (task #5): button that POSTs to /api/refresh, shows last-run timestamp.

export default function AdminRefreshPage() {
  return (
    <section>
      <h1 className="text-2xl font-bold">Refresh results</h1>
      <p className="mt-2 text-slate-600">
        The cron pulls results nightly. Use this to force an immediate fetch.
      </p>
      <p className="mt-8 text-xs text-slate-400">
        TODO: refresh button + last-run status.
      </p>
    </section>
  );
}
