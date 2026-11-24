export const DEFAULT_AFTER_SIGN_IN = "/inicio";

/**
 * Only same-origin paths are allowed after sign-in ("/perfil", "/materias?x=1").
 * Rejects absolute URLs, protocol-relative "//evil.com" and "/\evil.com".
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return DEFAULT_AFTER_SIGN_IN;
  if (["/entrar", "/criar-conta", "/callback"].some((path) => raw.startsWith(path))) return DEFAULT_AFTER_SIGN_IN;
  return raw;
}
