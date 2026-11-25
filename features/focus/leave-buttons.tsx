"use client";

import { Minimize2, Square, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { endSession, statusOf } from "@/lib/focus/timer";
import { useLastPath } from "./last-path";
import { useTimerStore } from "./timer-store";

const pill =
  "inline-flex h-11 items-center gap-2 rounded-full border border-(--focus-line) bg-black/15 px-4 text-sm font-semibold text-white no-underline";
// The phone has no room for the icons next to the sound and settings buttons.
const icon = { "aria-hidden": true, size: 18, strokeWidth: 1.75, className: "hidden md:block" } as const;

/**
 * Ways out of the focus mode. With a session: minimize it (it goes on, see FocusIndicator) or end
 * it, which asks first, because a session that isn't completed doesn't count.
 */
export function LeaveButtons() {
  const router = useRouter();
  const back = useLastPath((s) => s.path);
  const status = useTimerStore((s) => statusOf(s.timer));
  const phase = useTimerStore((s) => s.timer.phase);
  const startedAt = useTimerStore((s) => s.timer.startedAt);
  const act = useTimerStore((s) => s.act);
  /** Start of the session she was asked about: if it completes meanwhile, the question is gone. */
  const [asked, setAsked] = useState<number | null>(null);

  if (status === "idle") {
    return (
      <Link href={back} className={pill}>
        <X aria-hidden size={18} strokeWidth={1.75} />
        Sair do foco
      </Link>
    );
  }

  function end() {
    act(endSession);
    router.push(back);
  }

  return (
    <>
      <Link href={back} className={pill}>
        <Minimize2 {...icon} />
        Minimizar
      </Link>
      <button type="button" className={pill} onClick={() => (phase === "focus" ? setAsked(startedAt) : end())}>
        <Square {...icon} />
        Encerrar
      </button>
      <ConfirmDialog
        open={asked !== null && asked === startedAt && phase === "focus"}
        title="Encerrar a sessão?"
        description="Só a sessão concluída conta no foco do dia, na sequência e nos pontos. O tempo desta não será registrado. Para usar o app sem perder a sessão, escolha Minimizar."
        confirmLabel="Encerrar"
        danger
        onClose={() => setAsked(null)}
        onConfirm={end}
      />
    </>
  );
}
