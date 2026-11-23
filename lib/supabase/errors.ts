/** Error from a Supabase data call, keeping the HTTP status and the Supabase code. */
export class DataError extends Error {
  readonly status?: number;
  readonly code?: string;
  constructor(message: string, details: { status?: number; code?: string } = {}) {
    super(message);
    this.name = "DataError";
    this.status = details.status;
    this.code = details.code;
  }
}

interface ErrorLike {
  message?: string;
  status?: number;
  code?: string;
  name?: string;
}

function asErrorLike(error: unknown): ErrorLike {
  return typeof error === "object" && error !== null ? (error as ErrorLike) : { message: String(error ?? "") };
}

/**
 * Short technical tag shown in small print next to an error ("404 · PGRST205", "otp_expired"),
 * so a configuration problem can be identified from a photo of the screen.
 */
export function errorTag(error: unknown): string {
  const e = asErrorLike(error);
  const parts = [e.status && e.status > 0 ? String(e.status) : null, e.code ?? null].filter(Boolean);
  if (parts.length > 0) return parts.join(" · ");
  if (isNetworkError(e)) return "sem resposta do servidor";
  return e.name && e.name !== "Error" ? e.name : "erro desconhecido";
}

function isNetworkError(e: ErrorLike): boolean {
  // Browsers report a failed fetch as a TypeError with these messages (Chrome, Safari, Firefox,
  // Node); other TypeErrors are bugs and must not be disguised as "no connection".
  return (
    e.name === "AuthRetryableFetchError" ||
    /^(Failed to fetch|Load failed|NetworkError when attempting to fetch|fetch failed)/i.test(e.message ?? "")
  );
}

/** Supabase Auth error codes → message. https://supabase.com/docs/guides/auth/debugging/error-codes */
const AUTH_MESSAGES: Record<string, string> = {
  otp_expired: "Código inválido ou expirado. Confira os números ou peça um novo e-mail.",
  otp_disabled: "A entrada por e-mail está desligada neste projeto.",
  email_address_invalid: "Confira o e-mail digitado.",
  email_address_not_authorized:
    "O envio de e-mails ainda não está liberado para este endereço (configure o SMTP do projeto).",
  over_email_send_rate_limit: "Muitos e-mails seguidos. Espere um minuto e tente de novo.",
  over_request_rate_limit: "Muitas tentativas seguidas. Espere um minuto e tente de novo.",
  signup_disabled: "Novas contas estão desativadas neste projeto.",
  provider_disabled: "Esse jeito de entrar ainda não está configurado.",
};

/**
 * Turns Supabase/network errors into short Portuguese messages. Recognized error codes get a
 * specific message; anything else gets the fallback with the technical tag, and is logged, so a
 * misconfiguration is never disguised as "wrong code".
 */
export function friendlyError(error: unknown, fallback = "Não deu certo. Tente de novo."): string {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "Sem conexão. Tente de novo quando estiver online.";
  const e = asErrorLike(error);
  if (isNetworkError(e)) return "Não foi possível falar com o servidor. Confira a internet e tente de novo.";
  if (e.code && AUTH_MESSAGES[e.code]) return AUTH_MESSAGES[e.code];
  // Older Auth servers send no code for an expired or wrong e-mail code; this exact text means that.
  if (/^Token has expired or is invalid$/i.test(e.message ?? "")) return AUTH_MESSAGES.otp_expired;
  if (e.status === 429) return AUTH_MESSAGES.over_request_rate_limit;
  if (e.status === 413 || /payload too large|exceeded the maximum allowed size/i.test(e.message ?? "")) {
    return "A foto ficou grande demais.";
  }
  console.error("[lanima] erro não tratado:", error);
  return `${fallback} (${errorTag(e)})`;
}
