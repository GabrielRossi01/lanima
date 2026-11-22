import type { Metadata } from "next";
import { ListChecks } from "lucide-react";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Resumos e testes" };

export default function Page() {
  return (
    <ComingSoon
      title="Resumos e testes"
      icon={ListChecks}
      phase={6}
      description="Resumos em tópicos e testes feitos a partir dos seus arquivos."
    />
  );
}
