import type { NextRequest } from "next/server";
import { authErrorPath } from "@/lib/auth/pages";
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
 * - Google and Notion: ?code=… (PKCE, same browser that started it) plus ?provedor=.
 * Then goes to ?proxima= (same-origin only) or /inicio; the device decides about onboarding. When it
 * fails, back to Entrar, with the reason.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNextPath(searchParams.get("proxima"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (searchParams.get("error")) return redirectTo(authErrorPath(searchParams));

  const supabase = await createSupabaseServer();
  let ok = false;
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error && Boolean(data.session);
  } else if (tokenHash && (type === "email" || type === "magiclink" || type === "signup")) {
    const { data, error } = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash });
    ok = !error && Boolean(data.session);
  }

  return redirectTo(ok ? next : authErrorPath(searchParams));
}
