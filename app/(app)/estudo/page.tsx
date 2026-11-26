import type { Metadata } from "next";
import { Suspense } from "react";
import { StudyView } from "@/features/study/study-view";

export const metadata: Metadata = { title: "Resumos e testes" };

export default function Page() {
  // StudyView reads ?resumir= (useSearchParams): rendered on the device only.
  return (
    <Suspense>
      <StudyView />
    </Suspense>
  );
}
