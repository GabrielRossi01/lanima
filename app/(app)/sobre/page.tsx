import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Sobre e créditos" };

const credits = [
  { name: "Fraunces", detail: "Undercase Type, SIL Open Font License 1.1" },
  { name: "DM Sans", detail: "Colophon Foundry, SIL Open Font License 1.1" },
  { name: "Caveat", detail: "Impallari Type, SIL Open Font License 1.1" },
  { name: "Lucide", detail: "Ícones, licença ISC" },
];

export default function Page() {
  return (
    <>
      <PageHeader
        title="Sobre e créditos"
        subtitle="Lanima · planner de estudos de Biomedicina. Uso pessoal, sem fins comerciais."
      />
      <Card className="max-w-xl">
        <CardHeader title="Créditos" />
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {credits.map((c) => (
            <li key={c.name} className="flex flex-col">
              <span className="text-sm font-semibold">{c.name}</span>
              <span className="type-caption text-fg-2">{c.detail}</span>
            </li>
          ))}
        </ul>
        <p className="type-caption m-0 text-fg-2">Os créditos dos modelos 3D entram com o Atlas 3D.</p>
      </Card>
    </>
  );
}
