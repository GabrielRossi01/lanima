"use client";

import { useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-provider";
import { todayIn } from "@/lib/dates/calendar";
import { shortDay } from "@/lib/study/format";
import { byTopic, creditOf, pctLabel, REVIEW_BELOW, wrongOnes, type Answer } from "@/lib/study/grading";
import { newTestHref } from "@/lib/study/links";
import { friendlyError } from "@/lib/supabase/errors";
import { useAnswers, useLocalAttempts, useQuestionsByIds, useServerAttempts } from "./attempts";
import { createRedoTest } from "./redo";
import { useFinishedAttempts } from "./review";
import { useTests } from "./test-queries";

/**
 * "Último teste" of a subject (Materia.html, overview): the score of her latest finished attempt
 * among the subject's tests, right and wrong, the weak topics and "Refazer só as erradas".
 */
export function LastTestCard({ subjectId }: { subjectId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const userId = useAuth().user?.id;
  const tests = useTests().data;
  const finished = useFinishedAttempts().data;
  const local = useLocalAttempts().data;
  const server = useServerAttempts().data;
  const [busy, setBusy] = useState(false);

  const own = new Map((tests ?? []).filter((t) => t.subject_id === subjectId).map((t) => [t.id, t]));
  const last = (finished ?? []).find((a) => own.has(a.testId));
  const here = local?.find((l) => l.attempt.id === last?.id)?.attempt;
  const remote = server?.find((a) => a.id === last?.id);
  const ids = here?.questionIds ?? remote?.question_ids;
  const questions = useQuestionsByIds(ids).data ?? here?.questions;
  const remoteAnswers = useAnswers(!here && remote ? remote.id : null).data;
  const answers: Record<string, Answer> | undefined = here ? here.answers : remoteAnswers;

  if (!tests || !finished) {
    return (
      <Card>
        <CardHeader title="Último teste" />
        <div aria-busy className="h-24 animate-pulse rounded-md bg-surface-alt motion-reduce:animate-none" />
      </Card>
    );
  }
  if (!last) {
    return (
      <Card>
        <CardHeader title="Último teste" />
        <p className="type-body m-0 text-fg-2">
          {own.size === 0 ? "Nenhum teste desta matéria ainda." : "Você ainda não fez os testes desta matéria."}
        </p>
        <Link href={newTestHref({ subjectId })} className="self-start text-sm font-semibold">
          Criar teste
        </Link>
      </Card>
    );
  }

  const test = own.get(last.testId)!;
  const right = questions && answers ? questions.filter((q) => creditOf(q, answers[q.id]) === 1).length : null;
  const total = ids?.length ?? test.question_ids.length;
  const weak =
    questions && answers
      ? byTopic(questions, answers)
          .filter((t) => t.pct < REVIEW_BELOW)
          .map((t) => t.label)
      : [];
  const wrongCount = questions && answers ? wrongOnes(questions, answers).length : 0;
  const today = todayIn(new Date());
  const pct = Math.max(0, Math.min(100, last.score));

  async function redo() {
    if (!questions || !answers) return;
    if (!navigator.onLine) {
      toast({
        title: "Sem conexão",
        description: "Para criar o teste das erradas é preciso internet.",
        tone: "danger",
      });
      return;
    }
    setBusy(true);
    try {
      const id = await createRedoTest({ test, questions, answers, attemptId: last!.id, userId, queryClient });
      if (id) router.push(`/estudo/fazer?teste=${id}`);
      else setBusy(false);
    } catch (error) {
      toast({ title: "Não foi possível criar o teste", description: friendlyError(error), tone: "danger" });
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Último teste"
        action={
          <Link href={`/estudo/resultado?tentativa=${last.id}`} className="text-[13px] font-semibold">
            Ver resultado
          </Link>
        }
      />
      <section aria-label="Último teste" className="flex flex-col gap-3">
        <span className="text-sm font-medium wrap-break-word">{test.title}</span>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-serif text-[36px] leading-10 font-semibold tabular-nums">
            {last.score >= 0 ? pctLabel(last.score) : "…"}
          </span>
          <span className="text-sm text-fg-2">
            {right !== null ? `${right} de ${total} · ` : ""}
            {last.waiting ? "a sincronizar" : shortDay(last.finishedAt, today)}
          </span>
        </div>
        {last.score >= 0 && (
          <div aria-hidden className="flex h-2 gap-0.5 overflow-hidden rounded-full">
            {pct > 0 && <div className="h-full bg-success" style={{ width: `${pct}%` }} />}
            {pct < 100 && <div className="h-full bg-danger" style={{ width: `${100 - pct}%` }} />}
          </div>
        )}
        {weak.length > 0 && <span className="text-xs text-fg-2">Para revisar: {weak.join(", ")}</span>}
        <Button
          icon={RotateCcw}
          className="self-start"
          disabled={busy || !questions || !answers || wrongCount === 0}
          onClick={() => void redo()}
        >
          {wrongCount === 0 && questions && answers ? "Você acertou todas" : "Refazer só as erradas"}
        </Button>
      </section>
    </Card>
  );
}
