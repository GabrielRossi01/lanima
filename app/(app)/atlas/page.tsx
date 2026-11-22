import type { Metadata } from "next";
import { PersonStanding } from "lucide-react";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Atlas 3D" };

export default function Page() {
  return (
    <ComingSoon
      title="Atlas 3D"
      icon={PersonStanding}
      phase={10}
      description="Ossos, músculos, células e tecidos em 3D, com fatos e questões."
    />
  );
}
