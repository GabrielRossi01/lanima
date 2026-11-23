import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie before routes render, so Route Handlers (and, later, the AI
 * endpoints) always see a valid token.
 *
 * It deliberately does NOT redirect signed-out users. Pages are static shells whose data comes from
 * Supabase in the browser, protected by RLS; the decision "login / onboarding / app" is made on the
 * device (components/auth/auth-gate.tsx). A server redirect here would break offline use and could
 * make the service worker cache the login page in place of /inicio.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // Without the Supabase cookie there is nothing to refresh: skip the work (also for /design, /sobre…).
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
  if (!url || !key || !hasSession) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [header, value] of Object.entries(headers)) response.headers.set(header, value);
      },
    },
  });
  // Validates the JWT and refreshes it when expired. Do not run code between createServerClient and
  // this call (see @supabase/ssr docs).
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: [
    // Everything except build assets, the service worker, icons, fonts, the manifest and images.
    "/((?!_next/static|_next/image|serwist/|icons/|fonts/|manifest.webmanifest|favicon.ico|.*\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)",
  ],
};
