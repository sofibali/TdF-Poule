"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/admin/upload`,
      },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <div className="text-center mb-8">
        <div className="text-5xl mb-3">🚴‍♂️</div>
        <h1 className="text-2xl font-extrabold">Admin Sign In</h1>
        <p className="mt-2 text-sm text-slate-500">
          Just here to watch? Head to the{" "}
          <a className="text-amber-700 underline font-medium" href="/leaderboard">
            leaderboard
          </a>
          !
        </p>
      </div>

      {sent ? (
        <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-6 text-center text-sm text-emerald-800">
          <div className="text-3xl mb-2">📬</div>
          Check your email for a magic link!
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-medium">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border-2 border-amber-200 px-4 py-2.5 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
              placeholder="sofia@example.com"
            />
          </label>
          {err && <div className="text-sm text-red-600">{err}</div>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full jersey-yellow px-4 py-2.5 text-sm font-bold text-slate-900 shadow-md hover:shadow-lg transition-all disabled:opacity-50"
          >
            {busy ? "Sending..." : "Send magic link"}
          </button>
        </form>
      )}
    </main>
  );
}
