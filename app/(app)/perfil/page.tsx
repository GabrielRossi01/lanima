import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { ThemePicker } from "@/components/layout/theme-picker";
import { Card, CardHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Perfil" };

export default function Page() {
  return (
    <>
      <PageHeader title="Perfil e configurações" subtitle="Foto, dados e metas chegam na fase 2, junto com o login." />
      <div className="flex max-w-xl flex-col gap-5">
        <Card>
          <CardHeader title="Aparência" />
          <p className="type-body m-0 text-fg-2">Automático segue o tema do aparelho.</p>
          <ThemePicker className="self-start" />
        </Card>
        <Card>
          <CardHeader title="Sobre" />
          <Link href="/sobre" className="type-body font-semibold">
            Sobre e créditos
          </Link>
        </Card>
      </div>
    </>
  );
}
