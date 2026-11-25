import { isSocialProvider, PROVIDER_LABEL, type SocialProvider } from "./providers";
import { DEFAULT_AFTER_SIGN_IN, safeNextPath } from "./redirect";

/** Entrar (e-mail, Google, Notion) and Criar conta (step 1 of 3, e-mail). */
export type AuthMode = "entrar" | "criar-conta";

function withParams(path: string, params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

/** "/entrar" or "/criar-conta", keeping where to go afterwards (?proxima=). */
export function authPath(mode: AuthMode, next = DEFAULT_AFTER_SIGN_IN, extra: Record<string, string | undefined> = {}) {
  return withParams(`/${mode}`, { ...extra, proxima: next === DEFAULT_AFTER_SIGN_IN ? undefined : next });
}

/** Where the provider sends her back: /callback knows which provider it was. */
export function oauthCallbackUrl(origin: string, next: string, provider: SocialProvider): string {
  return withParams(`${origin}/callback`, { proxima: next, provedor: provider });
}

export type AuthProblem = "link" | "cancelado" | "sem-email" | "social";

/** Back to Entrar, with the problem to explain, from the parameters /callback received. */
export function authErrorPath(params: URLSearchParams): string {
  const provider = params.get("provedor");
  const next = safeNextPath(params.get("proxima"));
  if (!isSocialProvider(provider)) return authPath("entrar", next, { erro: "link" });

  let problem: AuthProblem = "social";
  if (params.get("error") === "access_denied") problem = "cancelado";
  // Supabase: "Error getting user email from external provider".
  else if (/user email/i.test(params.get("error_description") ?? "")) problem = "sem-email";
  return authPath("entrar", next, { erro: problem, provedor: provider });
}

/** Message for ?erro= (and ?provedor=) on the sign-in screens. */
export function authProblemMessage(problem: string | null, provider: string | null): string | undefined {
  if (!problem) return undefined;
  if (problem === "link") return "Esse link expirou ou já foi usado. Peça um novo e-mail.";
  if (!isSocialProvider(provider)) return undefined;
  const name = PROVIDER_LABEL[provider];
  if (problem === "cancelado") return `A entrada com o ${name} foi cancelada.`;
  if (problem === "sem-email") return `O ${name} não informou seu e-mail. Entre com o e-mail, abaixo.`;
  if (problem === "social") return `Não foi possível entrar com o ${name}. Tente de novo.`;
  return undefined;
}
