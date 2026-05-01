// Browser-side Supabase client. Use inside Client Components ("use client").
// TODO (task #5): wire this into auth form + realtime leaderboard subscription.
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
