import type { Metadata } from "next";
import { Suspense } from "react";
import { NotebookScreen } from "@/features/notebook/editor/notebook-screen";

export const metadata: Metadata = { title: "Caderno" };

// One address for every page (?pagina=): once opened, the service worker keeps this page, so any
// page opens offline, even one created offline. Full screen, like the focus mode.
export default function Page() {
  return (
    <Suspense>
      <NotebookScreen />
    </Suspense>
  );
}
