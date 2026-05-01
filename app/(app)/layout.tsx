// Public site layout — no login required. Renders a top nav with year selector.
// TODO (task #5): year selector dropdown reading distinct years from `pools`;
// show "Admin" link only when an authed session exists.
import Link from "next/link";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/leaderboard" className="font-bold tracking-tight">
            🚴 TDF Pool
          </Link>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link href="/leaderboard" className="hover:underline">
              Leaderboard
            </Link>
            <Link href="/matrix" className="hover:underline">
              All teams · stages
            </Link>
            <Link href="/riders" className="hover:underline">
              Riders
            </Link>
            {/* TODO: conditionally render only when an admin session exists */}
            <Link href="/admin/upload" className="text-slate-400 hover:underline">
              Admin
            </Link>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
