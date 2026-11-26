import type { Metadata } from "next";
import { Suspense } from "react";
import { ResultView } from "@/features/study/take/result-view";

export const metadata: Metadata = { title: "Resultado" };

// One address for every result (?tentativa=), so it opens offline right after an offline test.
export default function Page() {
  return (
    <Suspense>
      <ResultView />
    </Suspense>
  );
}
