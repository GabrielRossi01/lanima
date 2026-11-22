import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Matérias" };

export default function Page() {
  return (
    <ComingSoon
      title="Matérias"
      icon={BookOpen}
      phase={3}
      description="Suas matérias com cor, horário, plano de ensino, avaliações e progresso."
    />
  );
}
