import type { NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/redirect";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * Relative redirect: the browser stays on the host it used. `request.nextUrl.origin` can differ
 * from it (`next start -H 127.0.0.1` reports "localhost"), and the session cookies set here belong
 * to the host of this request, so an absolute redirect to another host would lose the session.
 */
function redirectTo(path: string) {
  return new Response(null, { status: 303, headers: { Location: path, "Cache-Control": "private, no-store" } });
}

/**
 * Finishes sign-in and sets the session cookies:
 * - magic link from the e-mail: ?token_hash=…&type=email (works in any browser, no PKCE verifier);
 * - Google OAuth: ?code=… (PKCE, same browser that started it).
 * Then goes to ?proxima= (same-origin only) or /inicio; the device decides about onboarding.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNextPath(searchParams.get("proxima"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (searchParams.get("error")) return redirectTo("/entrar?erro=google");

  const supabase = await createSupabaseServer();
  let ok = false;
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error && Boolean(data.session);
  } else if (tokenHash && (type === "email" || type === "magiclink" || type === "signup")) {
    const { data, error } = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash });
    ok = !error && Boolean(data.session);
  }

  return redirectTo(ok ? next : `/entrar?erro=${code ? "google" : "link"}`);
}
