/** Where a screen lives: the app itself, the onboarding, or the sign-in page. */
export type GateArea = "app" | "onboarding" | "sign-in";

export type AuthStatus = "loading" | "signed-out" | "signed-in" | "offline";

/**
 * Profile as far as routing cares: `undefined` while loading for the first time, `null` once it
 * failed to load (stays `null` while it retries), otherwise whether the onboarding is done.
 */
export type GateProfile = { onboardingDone: boolean } | null | undefined;

export type GateDecision =
  | { kind: "wait" }
  | { kind: "render" }
  | { kind: "redirect"; to: string }
  /** Online and signed in, but the profile can't be loaded: show the error screen. */
  | { kind: "error" };

const render: GateDecision = { kind: "render" };
const wait: GateDecision = { kind: "wait" };

/**
 * Decides, on the device, what a screen shows. Pure, so it is unit-tested.
 * "offline" means a session was seen on this device before but can't be confirmed now: the app
 * keeps working with cached data instead of throwing her out to the sign-in page.
 */
export function decideGate(
  area: GateArea,
  status: AuthStatus,
  profile: GateProfile,
  path = "/inicio",
  /** Sign-in page only: where to go once signed in (already validated with safeNextPath). */
  next = "/inicio",
): GateDecision {
  if (status === "loading") return wait;

  if (area === "sign-in") return status === "signed-in" ? { kind: "redirect", to: next } : render;

  if (status === "signed-out") {
    const next = area === "app" && path !== "/inicio" ? `?proxima=${encodeURIComponent(path)}` : "";
    return { kind: "redirect", to: `/entrar${next}` };
  }

  // Signed in (or offline with a known session).
  if (profile === undefined) return status === "offline" ? render : wait;
  // Failed. Offline, the app opens with what is on the device; online, it says so instead of
  // waiting forever on the splash or opening an app without her data.
  if (profile === null) return status === "offline" && area === "app" ? render : { kind: "error" };

  if (area === "app") return profile.onboardingDone ? render : { kind: "redirect", to: "/boas-vindas" };
  return profile.onboardingDone ? { kind: "redirect", to: "/inicio" } : render;
}
