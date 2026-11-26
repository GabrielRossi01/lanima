"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useAuth } from "@/features/auth/auth-provider";
import { useProfile, useUpdateProfile } from "@/features/profile/queries";
import { AI_MESSAGES, type AiFailure } from "@/lib/ai/messages";
import { AiRequestError, runAi } from "./ai-client";
import { remainingKey } from "./queries";

export const AI_NOTICE =
  "Para resumir e criar testes, o texto dos arquivos é enviado a um serviço de IA gratuito. Não envie dados pessoais ou de pacientes.";

/**
 * One AI generation at a time: the privacy notice the first time (section 7.12, "Entendi" saved in
 * the profile, so it shows once on any device), progress messages, and what went wrong.
 */
export function useGenerate() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const profile = useProfile().data;
  const updateProfile = useUpdateProfile();
  const [progress, setProgress] = useState<string | null>(null);
  const [failure, setFailure] = useState<AiFailure | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const answer = useRef<((ok: boolean) => void) | null>(null);

  const askNotice = useCallback((): Promise<boolean> => {
    if (profile?.ai_notice_accepted_at) return Promise.resolve(true);
    setNoticeOpen(true);
    return new Promise((resolve) => {
      answer.current = resolve;
    });
  }, [profile?.ai_notice_accepted_at]);

  const close = (ok: boolean) => {
    setNoticeOpen(false);
    answer.current?.(ok);
    answer.current = null;
  };

  const run = useCallback(
    async (path: "/api/ai/resumo" | "/api/ai/questoes", body: unknown) => {
      setFailure(null);
      if (!(await askNotice())) return null;
      setProgress("Preparando…");
      try {
        return await runAi(path, body, setProgress);
      } catch (error) {
        setFailure(error instanceof AiRequestError ? error.failure : "ocupado");
        return null;
      } finally {
        setProgress(null);
        void queryClient.invalidateQueries({ queryKey: remainingKey(user?.id) });
      }
    },
    [askNotice, queryClient, user?.id],
  );

  const notice: ReactNode = (
    <Sheet
      open={noticeOpen}
      onClose={() => close(false)}
      title="Antes de usar a IA"
      side="center"
      size="s"
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            Agora não
          </Button>
          <Button
            onClick={() => {
              void updateProfile.mutateAsync({ ai_notice_accepted_at: new Date().toISOString() }).catch(() => {});
              close(true);
            }}
          >
            Entendi
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <ShieldAlert aria-hidden size={22} strokeWidth={1.75} className="mt-0.5 shrink-0 text-accent" />
        <p className="type-body m-0">{AI_NOTICE}</p>
      </div>
    </Sheet>
  );

  return { run, progress, failure, clearFailure: () => setFailure(null), notice };
}

/** The error of a generation, as a card in the place of the result. */
export function AiFailureCard({ failure, action }: { failure: AiFailure; action?: ReactNode }) {
  const { title, description } = AI_MESSAGES[failure];
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-card border border-line bg-surface-alt p-4">
      <p className="m-0 text-[15px] font-semibold">{title}</p>
      <p className="type-body m-0 text-fg-2">{description}</p>
      {action}
    </div>
  );
}

/** Skeleton with the real progress message (section 7.5, "Carregando"). */
export function AiProgress({ message }: { message: string }) {
  return (
    <div className="flex flex-col gap-3" aria-busy>
      <p role="status" className="m-0 text-sm font-semibold text-accent">
        {message}
      </p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded-card bg-surface-alt motion-reduce:animate-none" />
      ))}
    </div>
  );
}
