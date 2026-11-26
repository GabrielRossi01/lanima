"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { countUnsent, sendSessions } from "@/features/focus/session-store";
import { countUnsentEdits, pendingEdits, sendEdits } from "@/features/study/summary-sync";
import { friendlyError } from "@/lib/supabase/errors";
import { useAuth } from "./auth-provider";

/** How long leaving waits for the sessions to be sent before asking. */
const SEND_WAIT_MS = 4000;

interface SignOutButtonProps {
  variant?: "ghost" | "secondary";
  size?: "s" | "m";
}

/** "Sair": asks first if a focus session or a summary edit would be lost, because it wasn't sent yet. */
export function SignOutButton({ variant = "ghost", size }: SignOutButtonProps) {
  const { user, signOut } = useAuth();
  const [leaving, setLeaving] = useState(false);
  const [unsent, setUnsent] = useState(0);
  const [unsentEdits, setUnsentEdits] = useState(0);

  async function leave() {
    setLeaving(true);
    try {
      await signOut(); // The gate goes to /entrar as soon as the session is gone.
    } catch (error) {
      toast({ title: "Não foi possível sair", description: friendlyError(error), tone: "danger" });
    } finally {
      setLeaving(false);
    }
  }

  async function onClick() {
    setLeaving(true);
    if (user && ((await countUnsent(user.id)) > 0 || (await countUnsentEdits(user.id)) > 0)) {
      const sendEditsNow = async () => {
        for (const { summaryId } of await pendingEdits(user.id)) await sendEdits(user.id, summaryId);
      };
      await Promise.race([
        Promise.all([sendSessions(user.id), sendEditsNow()]),
        new Promise((done) => setTimeout(done, SEND_WAIT_MS)),
      ]);
      const left = await countUnsent(user.id);
      const leftEdits = await countUnsentEdits(user.id);
      if (left > 0 || leftEdits > 0) {
        setUnsent(left);
        setUnsentEdits(leftEdits);
        setLeaving(false);
        return;
      }
    }
    await leave();
  }

  const sessionsText =
    unsent === 1
      ? "Uma sessão de foco ainda não foi enviada para a sua conta."
      : `${unsent} sessões de foco ainda não foram enviadas para a sua conta.`;
  const editsText =
    unsentEdits === 1
      ? "As alterações de um resumo ainda não foram enviadas."
      : `As alterações de ${unsentEdits} resumos ainda não foram enviadas.`;
  const lost = unsent + unsentEdits === 1 ? "ela se perde" : "elas se perdem";

  return (
    <>
      <Button variant={variant} size={size} icon={LogOut} onClick={onClick} disabled={leaving}>
        {leaving ? "Saindo…" : "Sair"}
      </Button>
      <ConfirmDialog
        open={unsent > 0 || unsentEdits > 0}
        title="Sair sem enviar?"
        description={`${[unsent > 0 && sessionsText, unsentEdits > 0 && editsText].filter(Boolean).join(" ")} Se você sair agora, ${lost}.`}
        confirmLabel="Sair mesmo assim"
        danger
        busy={leaving}
        onClose={() => {
          setUnsent(0);
          setUnsentEdits(0);
        }}
        onConfirm={() => void leave()}
      />
    </>
  );
}
