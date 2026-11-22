import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ThemePicker } from "@/components/layout/theme-picker";
import { Showcase } from "./showcase";

export const metadata: Metadata = { title: "Sistema visual" };

/** Living style guide: every base component in both themes, side by side from 1280 px. */
export default function DesignPage() {
  return (
    <main className="mx-auto flex max-w-[1600px] flex-col gap-6 px-[max(16px,env(safe-area-inset-left))] py-6 md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link
            href="/inicio"
            className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold no-underline"
          >
            <ArrowLeft aria-hidden size={18} strokeWidth={1.75} />
            Voltar ao app
          </Link>
          <h1 className="type-display m-0">Sistema visual</h1>
          <p className="type-body m-0 text-fg-2">Componentes-base do Lanima nos temas claro e escuro.</p>
        </div>
        <ThemePicker />
      </header>
      <div className="grid gap-6 xl:grid-cols-2">
        <Showcase theme="light" />
        <Showcase theme="dark" />
      </div>
    </main>
  );
}
