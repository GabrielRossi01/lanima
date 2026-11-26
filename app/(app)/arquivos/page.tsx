import type { Metadata } from "next";
import { FilesView } from "@/features/files/files-view";

export const metadata: Metadata = { title: "Arquivos" };

export default function Page() {
  return <FilesView />;
}
