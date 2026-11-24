"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useProfile } from "@/features/profile/queries";
import { useThemeSync } from "@/features/profile/theme-sync";
import { decideGate, type GateArea, type GateProfile } from "@/lib/auth/gate";
import { safeNextPath } from "@/lib/auth/redirect";
import { useAuth } from "./auth-provider";
import { ProfileErrorScreen } from "./profile-error-screen";
import { Splash } from "./splash";

/**
 * Decides on the device whether a screen renders, waits, or sends her to sign-in or onboarding
 * (see proxy.ts for why this is not done on the server).
 */
export function AuthGate({ area, children }: { area: GateArea; children: ReactNode }) {
  const auth = useAuth();
  const profile = useProfile();
  const pathname = usePathname();
  const router = useRouter();
  useThemeSync(profile.data);
  // Last error seen: a retry clears `profile.error`, but the screen keeps showing the cause.
  const [lastError, setLastError] = useState<unknown>(null);
  if (profile.error && profile.error !== lastError) setLastError(profile.error);

  // `errorUpdateCount`, not `isError`: when the query retries (e.g. a component that reads the
  // profile mounts), TanStack Query v5 sets a query without data back to "pending". Using isError
  // made the gate flip between the app and the splash in a loop while the profile kept failing.
  const gateProfile: GateProfile = profile.data
    ? { onboardingDone: Boolean(profile.data.onboarding_completed_at) }
    : profile.errorUpdateCount > 0
      ? null
      : undefined;
  // ?proxima= on the sign-in page. Read only after the session is known, i.e. in the browser.
  const next =
    area === "sign-in" && auth.status !== "loading" && typeof window !== "undefined"
      ? safeNextPath(new URLSearchParams(window.location.search).get("proxima"))
      : undefined;
  // Who chose to leave starts over from Início: no ?proxima= back to the screen with the button.
  const decision = decideGate(area, auth.status, gateProfile, auth.left ? "/inicio" : pathname, next);
  const target = decision.kind === "redirect" ? decision.to : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [router, target]);

  if (decision.kind === "render") return children;
  if (decision.kind === "error") {
    return (
      <ProfileErrorScreen
        error={profile.error ?? lastError}
        retrying={profile.isFetching}
        onRetry={() => void profile.refetch()}
        onSignOut={auth.signOut}
      />
    );
  }
  return <Splash />;
}
