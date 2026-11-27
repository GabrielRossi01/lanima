import type { Metadata } from "next";
import { NotebooksView } from "@/features/notebook/notebooks-view";

export const metadata: Metadata = { title: "Caderno" };

export default function Page() {
  return <NotebooksView />;
}
