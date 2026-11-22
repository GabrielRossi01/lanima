import type { Metadata } from "next";
import { PenLine } from "lucide-react";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Caderno" };

export default function Page() {
  return (
    <ComingSoon
      title="Caderno"
      icon={PenLine}
      phase={7}
      description="Cadernos por matéria, para escrever à mão com a S Pen ou o Apple Pencil."
    />
  );
}
