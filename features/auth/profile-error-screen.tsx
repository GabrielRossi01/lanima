"use client";

import { CloudOff, LogOut, RotateCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { IconTile } from "@/components/ui/icon-tile";
import { Logo } from "@/components/ui/logo";
import { errorTag } from "@/lib/supabase/errors";

interface ProfileErrorScreenProps {
  error: unknown;
  retrying: boolean;
  onRetry: () => void;
  onSignOut: () => Promise<void>;
}

/**
 * Signed in and online, but the profile can't be loaded. Instead of a silent splash, it says so,
 * offers a retry and a way out, and shows a small technical tag ("perfil: 404 · PGRST205") that
 * identifies the cause from a photo of the screen.
 */
export function ProfileErrorScreen({ error, retrying, onRetry, onSignOut }: ProfileErrorScreenProps) {
  const [leaving, setLeaving] = useState(false);
  return (
    <main
      id="conteudo"
      className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-bg px-[max(20px,env(safe-area-inset-left))] py-10 text-center"
    >
      <Logo />
      <div role="alert" className="flex max-w-md flex-col items-center gap-3">
        <IconTile icon={CloudOff} size={48} />
        <h1 className="type-page-title m-0">Não foi possível carregar seu perfil</h1>
        <p className="type-body m-0 text-fg-2">
          Confira a internet e tente de novo. Se continuar, avise quem cuida do Lanima e mande uma foto desta tela.
        </p>
        <p className="type-caption m-0 text-fg-2">perfil: {errorTag(error)}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button icon={RotateCw} onClick={onRetry} disabled={retrying}>
          {retrying ? "Tentando…" : "Tentar de novo"}
        </Button>
        <Button
          variant="secondary"
          icon={LogOut}
          disabled={leaving}
          onClick={async () => {
            setLeaving(true);
            try {
              await onSignOut();
            } finally {
              setLeaving(false);
            }
          }}
        >
          Sair
        </Button>
      </div>
    </main>
  );
}
