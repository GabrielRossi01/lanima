"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useProfile } from "@/features/profile/queries";
import { useThemeSync } from "@/features/profile/theme-sync";
import { decideGate, type GateArea, type GateProfile } from "@/lib/auth/gate";
import { safeNextPath } from "@/lib/auth/redirect";
import { useAuth } from "./auth-provider";
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

  const gateProfile: GateProfile = profile.data
    ? { onboardingDone: Boolean(profile.data.onboarding_completed_at) }
    : profile.isError
      ? null
      : undefined;
  // ?proxima= on the sign-in page. Read only after the session is known, i.e. in the browser.
  const next =
    area === "sign-in" && auth.status !== "loading" && typeof window !== "undefined"
      ? safeNextPath(new URLSearchParams(window.location.search).get("proxima"))
      : undefined;
  const decision = decideGate(area, auth.status, gateProfile, pathname, next);
  const target = decision.kind === "redirect" ? decision.to : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [router, target]);

  return decision.kind === "render" ? children : <Splash />;
}
