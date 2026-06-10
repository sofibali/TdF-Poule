import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="bg-slate-900 text-white shadow-lg">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/leaderboard" className="flex items-center gap-2">
            <span className="text-xl">🔧</span>
            <span className="font-bold tracking-tight">TDF Poule · Admin</span>
          </Link>
          <div className="flex gap-3 text-sm">
            <Link href="/admin/upload" className="rounded-full bg-white/10 px-3 py-1 hover:bg-white/20 transition-colors">Upload</Link>
            <Link href="/admin/results" className="rounded-full bg-white/10 px-3 py-1 hover:bg-white/20 transition-colors">Resolve</Link>
            <Link href="/admin/refresh" className="rounded-full bg-white/10 px-3 py-1 hover:bg-white/20 transition-colors">Refresh</Link>
            <Link href="/leaderboard" className="rounded-full bg-amber-500/20 text-amber-300 px-3 py-1 hover:bg-amber-500/30 transition-colors">← Exit</Link>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
