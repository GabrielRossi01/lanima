/**
 * E-mail sign-in code. Supabase lets each project choose 6 to 10 digits (Authentication → Email →
 * Email OTP Length); accepting the whole range means a dashboard change never locks anyone out.
 */
export const OTP_MIN_DIGITS = 6;
export const OTP_MAX_DIGITS = 10;

/** Keeps only digits (people paste "123 456" or "123-456"), up to the maximum length. */
export function cleanOtpInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, OTP_MAX_DIGITS);
}

export function isValidOtp(code: string): boolean {
  return /^\d+$/.test(code) && code.length >= OTP_MIN_DIGITS && code.length <= OTP_MAX_DIGITS;
}
