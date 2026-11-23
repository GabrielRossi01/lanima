"use client";

import { useState } from "react";
import { AuthFrame } from "@/components/layout/auth-frame";
import { AuthGate } from "@/features/auth/auth-gate";
import { OnboardingView } from "@/features/onboarding/onboarding-view";

export function OnboardingScreen() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  return (
    <AuthGate area="onboarding">
      {/* On phones the dark welcome panel is step 1 itself; steps 2 and 3 get the whole screen. */}
      <AuthFrame heroOnPhone={step === 1}>
        <OnboardingView step={step} onStepChange={setStep} />
      </AuthFrame>
    </AuthGate>
  );
}
