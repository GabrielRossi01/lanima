import type { Metadata } from "next";
import { OnboardingScreen } from "./onboarding-screen";

export const metadata: Metadata = { title: "Boas-vindas" };

export default function Page() {
  return <OnboardingScreen />;
}
