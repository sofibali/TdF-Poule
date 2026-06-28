import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tour de France Poule",
  description: "Family Tour de France pool — live leaderboard since 1991.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
