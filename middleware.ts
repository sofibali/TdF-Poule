import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Refreshes the user's auth cookie on every request and gates the (app) routes.
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Run on everything except static assets and image optimisation
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
