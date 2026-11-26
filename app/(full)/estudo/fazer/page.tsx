import type { Metadata } from "next";
import { Suspense } from "react";
import { TestRunner } from "@/features/study/take/test-runner";

export const metadata: Metadata = { title: "Teste" };

// One address for every test (?teste=): once opened, the service worker keeps this page, so any
// saved test can be taken offline. Full screen, like the focus mode.
export default function Page() {
  return (
    <Suspense>
      <TestRunner />
    </Suspense>
  );
}
