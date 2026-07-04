"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/leaderboard", label: "Leaderboard", icon: "🏆" },
  { href: "/matrix", label: "Stages", icon: "📊" },
  { href: "/riders", label: "Riders", icon: "🚴" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();

  return (
    <div className="min-h-screen">
      {/* Header with yellow jersey gradient */}
      <header className="jersey-yellow shadow-md">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/leaderboard" className="flex items-center gap-2">
            <span className="text-2xl">🚴‍♂️</span>
            <div>
              <div className="font-extrabold text-lg tracking-tight text-slate-900 leading-tight">
                Zuurbier Tour de France Poule
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-1 sm:gap-2">
            {navItems.map((item) => {
              const active = path === item.href || path?.startsWith(item.href + "?");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                    active
                      ? "bg-white/80 text-slate-900 shadow-sm"
                      : "text-amber-900/70 hover:bg-white/40 hover:text-slate-900"
                  }`}
                >
                  <span className="hidden sm:inline">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
            <Link
              href="/admin/upload"
              className="ml-2 rounded-full bg-amber-900/10 px-3 py-1.5 text-xs font-medium text-amber-900/50 hover:bg-amber-900/20 hover:text-amber-900 transition-all"
            >
              Admin
            </Link>
          </div>
        </nav>
      </header>

      {/* Decorative road stripe */}
      <div className="road-stripe" />

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>

      {/* Footer */}
      <footer className="mt-auto border-t border-amber-200/50 bg-amber-50/50 py-4 text-center text-xs text-amber-800/40">
        <div>Zuurbier Tour de France Poule — since 1991</div>
      </footer>
    </div>
  );
}
