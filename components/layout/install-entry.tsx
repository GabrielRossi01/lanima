"use client";

import { Download, Share, SquarePlus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { useInstall } from "@/lib/pwa/use-install";

interface InstallEntryProps {
  /** `compact`: icon-only, for the 72 px rail. */
  compact?: boolean;
  className?: string;
}

/**
 * "Instalar o Lanima". Android/Chromium uses the deferred `beforeinstallprompt`;
 * iOS/iPadOS Safari gets the manual steps sheet. Renders nothing once installed.
 */
export function InstallEntry({ compact = false, className }: InstallEntryProps) {
  const { mode, promptInstall } = useInstall();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (mode === null || mode === "installed" || mode === "unavailable") return null;

  async function onClick() {
    if (mode === "prompt") {
      const outcome = await promptInstall();
      if (outcome === "accepted")
        toast({ title: "Lanima instalado", tone: "success", description: "Abra pelo ícone na tela inicial." });
      return;
    }
    setSheetOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-label={compact ? "Instalar o Lanima" : undefined}
        title={compact ? "Instalar o Lanima" : undefined}
        className={cn(
          "flex min-h-11 items-center gap-3 rounded-md text-sm font-semibold text-accent transition-colors duration-150 hover:bg-surface-alt",
          compact ? "size-11 justify-center" : "px-3.5",
          className,
        )}
      >
        <Download aria-hidden size={20} strokeWidth={1.75} className="shrink-0" />
        {!compact && <span>Instalar o Lanima</span>}
      </button>
      <InstallSheet open={sheetOpen} onClose={() => setSheetOpen(false)} otherBrowser={mode === "ios-other-browser"} />
    </>
  );
}

interface InstallSheetProps {
  open: boolean;
  onClose: () => void;
  /** iOS but not Safari: installing only works from Safari. */
  otherBrowser?: boolean;
}

export function InstallSheet({ open, onClose, otherBrowser = false }: InstallSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="s"
      title="Instalar o Lanima"
      description="Fica na tela de início, abre em tela cheia e funciona sem internet."
      footer={<Button onClick={onClose}>Entendi</Button>}
    >
      {otherBrowser ? (
        <p className="type-body m-0">
          No iPhone e no iPad, a instalação só funciona pelo <strong>Safari</strong>. Abra este endereço no Safari e
          toque em Compartilhar → Adicionar à Tela de Início.
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          <Step n={1} icon={<Share aria-hidden size={20} strokeWidth={1.75} />}>
            Toque em <strong>Compartilhar</strong> na barra do Safari.
          </Step>
          <Step n={2} icon={<SquarePlus aria-hidden size={20} strokeWidth={1.75} />}>
            Role a lista e escolha <strong>Adicionar à Tela de Início</strong>.
          </Step>
          <Step n={3}>
            Toque em <strong>Adicionar</strong>. O Lanima aparece na tela de início.
          </Step>
        </ol>
      )}
    </Sheet>
  );
}

function Step({ n, icon, children }: { n: number; icon?: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3.5 rounded-lg bg-surface-alt p-3.5">
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-bold text-accent"
      >
        {n}
      </span>
      <span className="type-body min-w-0 flex-1">
        <span className="sr-only">Passo {n}: </span>
        {children}
      </span>
      {icon && <span className="text-accent">{icon}</span>}
    </li>
  );
}
