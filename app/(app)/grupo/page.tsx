import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Grupo e ranking" };

export default function Page() {
  return (
    <ComingSoon
      title="Grupo e ranking"
      icon={Trophy}
      phase={9}
      description="Estude com as amigas: convite por código, pontos e sequência de dias."
    />
  );
}
