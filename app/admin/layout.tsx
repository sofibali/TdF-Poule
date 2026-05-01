// Admin-only shell. Middleware already redirects unauthenticated users to /login,
// so by the time we render here the session is guaranteed.
import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-amber-50">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/leaderboard" className="font-bold tracking-tight">
            🚴 TDF Pool · admin
          </Link>
          <div className="flex gap-4 text-sm">
            <Link href="/admin/upload" className="hover:underline">Upload teams</Link>
            <Link href="/admin/results" className="hover:underline">Results</Link>
            <Link href="/admin/refresh" className="hover:underline">Refresh</Link>
            <Link href="/leaderboard" className="text-slate-500 hover:underline">Exit</Link>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
