import type { Metadata } from "next";
import { Suspense } from "react";
import { NewTestWizard } from "@/features/study/new-test/wizard";

export const metadata: Metadata = { title: "Novo teste" };

// The wizard reads ?materia=, ?resumo= and ?arquivo=: it renders on the device, the rest of the page
// is prerendered.
export default function Page() {
  return (
    <Suspense
      fallback={<div aria-busy className="h-40 animate-pulse rounded-card bg-surface-alt motion-reduce:animate-none" />}
    >
      <NewTestWizard />
    </Suspense>
  );
}
