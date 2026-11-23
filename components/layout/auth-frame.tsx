import { Flame } from "lucide-react";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/ui/logo";
import { cn } from "@/lib/cn";

interface AuthFrameProps {
  children: ReactNode;
  /** On phones the dark welcome panel takes the top of the screen only when this is true. */
  heroOnPhone?: boolean;
}

function FloatingCard({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div
      aria-hidden
      className={cn(
        "absolute flex flex-col gap-1.5 rounded-[18px] border border-white/8 bg-night-800 px-[18px] py-4 shadow-[0_16px_40px_-4px_rgba(0,0,0,0.3)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Sign-in and onboarding frame (Onboarding.html): dark 500 px welcome panel on the left from
 * 768 px, content on the right. Dark in both themes (section 4.1).
 */
export function AuthFrame({ children, heroOnPhone = false }: AuthFrameProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg md:flex-row">
      <aside
        className={cn(
          "relative shrink-0 flex-col gap-6 overflow-hidden bg-night-900 text-white",
          "px-[max(24px,env(safe-area-inset-left))] pt-[max(32px,env(safe-area-inset-top))] pb-8",
          "md:flex md:w-[clamp(320px,42vw,500px)] md:p-12",
          heroOnPhone ? "flex" : "hidden",
        )}
      >
        <div className="flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-[10px] bg-night-800 text-[#C2CFD8]">
            <LogoMark size={23} />
          </span>
          <span className="font-serif text-2xl font-semibold tracking-[-0.5px]">Lanima</span>
        </div>
        <p className="m-0 mt-2 font-serif text-[34px] leading-[40px] font-semibold tracking-[-1px] wrap-break-word md:mt-6 md:text-[44px] md:leading-[50px]">
          Seus estudos de Biomedicina, num lugar só.
        </p>
        <p className="m-0 text-base leading-6 text-[#C2CFD8]">
          Organize matérias, anote à mão, resuma seus arquivos, faça testes e estude junto com as amigas.
        </p>
        <div className="relative hidden min-h-[340px] flex-1 md:block">
          <FloatingCard className="top-10 left-6 -rotate-4">
            <span className="type-overline text-[#9FB3C0]">Modo foco</span>
            <span className="font-serif text-[40px] leading-10 font-light">25:00</span>
          </FloatingCard>
          <FloatingCard className="top-[150px] left-[min(196px,40%)] rotate-5">
            <span className="type-overline text-[#9FB3C0]">Teste · Difícil</span>
            <span className="w-[170px] text-[15px] font-semibold">Caso clínico: o que explica a osteoporose?</span>
          </FloatingCard>
          <FloatingCard className="top-[250px] left-10 -rotate-2">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Flame size={18} strokeWidth={1.75} className="text-hl-yellow" />
              12 dias seguidos
            </span>
          </FloatingCard>
        </div>
      </aside>
      <main
        id="conteudo"
        className="flex min-w-0 flex-1 flex-col px-[max(20px,env(safe-area-inset-left))] pt-[max(24px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))] md:px-12 md:py-12 lg:px-16"
      >
        {children}
      </main>
    </div>
  );
}
