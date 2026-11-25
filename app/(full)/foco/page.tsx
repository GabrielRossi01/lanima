import type { Metadata } from "next";
import { Suspense } from "react";
import { FocusScreen } from "@/features/focus/focus-screen";

export const metadata: Metadata = { title: "Modo foco" };

/** Full-screen, always dark (section 4.1). useSearchParams (?materia=) needs the Suspense boundary. */
export default function Page() {
  return (
    <Suspense>
      <FocusScreen />
    </Suspense>
  );
}
