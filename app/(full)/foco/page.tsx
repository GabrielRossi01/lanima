import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Modo foco" };

/** Full-screen, always dark (section 4.1). The timer itself arrives in phase 4. */
export default function Page() {
  return (
    <div className="flex min-h-dvh flex-col bg-[radial-gradient(ellipse_at_top,var(--color-night-800),var(--color-night-900)_55%,var(--color-night-950))] px-[max(20px,env(safe-area-inset-left))] pt-[max(20px,env(safe-area-inset-top))] pb-[max(20px,env(safe-area-inset-bottom))] text-white">
      <div>
        <ButtonLink href="/inicio" variant="inverse" icon={ArrowLeft} size="s">
          Sair do foco
        </ButtonLink>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <span className="type-timer">25:00</span>
        <p className="type-body m-0 max-w-xs text-on-deep-2">O cronômetro do modo foco chega na fase 4.</p>
      </div>
    </div>
  );
}
