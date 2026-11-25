"use client";

import { useEffect, useState } from "react";
import { AuthFrame } from "@/components/layout/auth-frame";
import { AuthGate } from "@/features/auth/auth-gate";
import { OnboardingView } from "@/features/onboarding/onboarding-view";
import type { Step } from "@/features/onboarding/steps";
import { cameFromSignUp, forgetSignUp } from "@/lib/auth/sign-up";

export function OnboardingScreen() {
  // "Criar conta" already was step 1. From Entrar (Google, Notion) or the e-mail's link, it starts here.
  const [step, setStep] = useState<Step>(() => (cameFromSignUp() ? 2 : 1));
  useEffect(forgetSignUp, []);
  return (
    <AuthGate area="onboarding">
      {/* On phones the dark welcome panel is step 1 itself; steps 2 and 3 get the whole screen. */}
      <AuthFrame heroOnPhone={step === 1}>
        <OnboardingView step={step} onStepChange={setStep} />
      </AuthFrame>
    </AuthGate>
  );
}
