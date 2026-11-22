import type { Metadata } from "next";
import { Folder } from "lucide-react";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Arquivos" };

export default function Page() {
  return (
    <ComingSoon
      title="Arquivos"
      icon={Folder}
      phase={5}
      description="Envie PDFs, slides e fotos para ler, resumir e criar testes."
    />
  );
}
