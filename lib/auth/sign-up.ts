/**
 * Whether this page load came from "Criar conta", which already was step 1: the onboarding then opens
 * on step 2. In memory only: opened from the e-mail's link, the onboarding starts from its own step 1.
 */
let started = false;

export function markSignUp(): void {
  started = true;
}

export function cameFromSignUp(): boolean {
  return started;
}

export function forgetSignUp(): void {
  started = false;
}
