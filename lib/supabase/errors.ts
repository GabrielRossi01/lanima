/** Turns Supabase/network errors into short Portuguese messages for toasts and forms. */
export function friendlyError(error: unknown, fallback = "Não deu certo. Tente de novo."): string {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "Sem conexão. Tente de novo quando estiver online.";
  const e = (error ?? {}) as { message?: string; status?: number; code?: string; name?: string };
  const message = e.message ?? "";
  if (e.name === "AuthRetryableFetchError" || /fetch|network|Failed to fetch|Load failed/i.test(message)) {
    return "Não foi possível falar com o servidor. Confira a internet e tente de novo.";
  }
  if (e.status === 429 || e.code === "over_email_send_rate_limit" || e.code === "over_request_rate_limit") {
    return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
  }
  if (e.code === "otp_expired" || /token has expired|invalid/i.test(message)) {
    return "Código inválido ou expirado. Confira os números ou peça um novo e-mail.";
  }
  if (e.code === "email_address_invalid" || /invalid email|email address/i.test(message)) {
    return "Confira o e-mail digitado.";
  }
  if (/payload too large|exceeded the maximum allowed size/i.test(message)) return "A foto ficou grande demais.";
  return fallback;
}
