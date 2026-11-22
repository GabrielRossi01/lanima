import type { Metadata } from "next";
import { BriefcaseBusiness } from "lucide-react";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Extensão" };

export default function Page() {
  return (
    <ComingSoon
      title="Extensão"
      icon={BriefcaseBusiness}
      phase={8}
      description="Quadro de tarefas, horas, galeria e cronograma do projeto de extensão."
    />
  );
}
