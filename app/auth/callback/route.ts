// Magic-link callback. Supabase redirects here after the user clicks the
// link in their email; we exchange the auth code for a session cookie, then
// forward them to wherever they intended to go (default: /admin/upload).

import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/admin/upload";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Token missing or invalid — bounce back to login with a flag so the form
  // can show "that link expired, try again."
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
