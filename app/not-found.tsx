import type { Metadata } from "next";
import { House, SearchX } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { IconTile } from "@/components/ui/icon-tile";
import { Logo } from "@/components/ui/logo";

export const metadata: Metadata = { title: "Página não encontrada" };

/**
 * 404 for any URL the app doesn't have (and for notFound() calls). Public: it doesn't depend on the
 * session; "Voltar para o início" leads to /inicio, which sends signed-out visitors to /entrar.
 */
export default function NotFound() {
  return (
    <main
      id="conteudo"
      className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-bg px-[max(20px,env(safe-area-inset-left))] py-10 text-center"
    >
      <Logo />
      <div className="flex max-w-md flex-col items-center gap-3">
        <IconTile icon={SearchX} size={48} />
        <span className="type-overline text-fg-2">Erro 404</span>
        <h1 className="type-page-title m-0">Página não encontrada</h1>
        <p className="type-body m-0 text-fg-2">
          O endereço pode estar errado ou a página pode ter mudado de lugar. Confira o link ou volte para o início.
        </p>
      </div>
      <ButtonLink href="/inicio" icon={House}>
        Voltar para o início
      </ButtonLink>
    </main>
  );
}
