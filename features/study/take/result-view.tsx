"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Download, FileText, ListChecks, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-provider";
import { useFiles } from "@/features/files/queries";
import { useNotebookDocuments } from "@/features/notebook/documents";
import { DIFFICULTY_LABELS } from "@/lib/ai/schemas";
import { cn } from "@/lib/cn";
import { formatDate, todayIn } from "@/lib/dates/calendar";
import { shortDay } from "@/lib/study/format";
import {
  answerText,
  byLevel,
  byTopic,
  correctText,
  creditOf,
  durationLabel,
  pctLabel,
  pointsFor,
  REVIEW_BELOW,
  scoreOf,
  wrongOnes,
  type Answer,
  type FinishedAttempt,
  type Stat,
} from "@/lib/study/grading";
import { topicKey } from "@/lib/study/test-config";
import { friendlyError } from "@/lib/supabase/errors";
import { useSubjects } from "@/features/subjects/queries";
import { TestPdfSheet } from "../pdf-sheets";
import { useSummaries } from "../queries";
import { createRedoTest } from "../redo";
import { AiDisclaimer } from "../study-view";
import { useTests } from "../test-queries";
import {
  useAnswers,
  useAttemptSync,
  useLocalAttempts,
  useQuestionsByIds,
  useServerAttempts,
  useTestQuestions,
} from "../attempts";

function barColor(pct: number) {
  return pct >= 80 ? "bg-success" : pct >= REVIEW_BELOW ? "bg-warning" : "bg-danger";
}

/** `review`: topics under 60% are marked "Para revisar" (section 7.5); levels are not topics. */
function Bars({
  title,
  stats,
  link,
  review = false,
}: {
  title: string;
  stats: Stat[];
  link?: (label: string) => string | null;
  review?: boolean;
}) {
  return (
    <section className="flex min-w-0 flex-1 flex-col gap-3.5 rounded-card border border-line bg-surface p-5 shadow-card">
      <h2 className="m-0 text-base font-semibold">{title}</h2>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {stats.map((s) => {
          const href = link?.(s.label);
          return (
            <li key={s.label} className="flex flex-col gap-1.5">
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 text-sm font-medium wrap-break-word">{s.label}</span>
                {review &&
                  s.pct < REVIEW_BELOW &&
                  (href ? (
                    <Link href={href} className="text-xs font-semibold text-danger-text">
                      Para revisar
                    </Link>
                  ) : (
                    <span className="text-xs font-semibold text-danger-text">Para revisar</span>
                  ))}
                <span className="text-[13px] text-fg-2 tabular-nums">
                  {s.right.toLocaleString("pt-BR")}/{s.total}
                </span>
                <span className="w-11 text-right text-sm font-bold tabular-nums">{s.pct}%</span>
              </span>
              <div
                role="progressbar"
                aria-label={s.label}
                aria-valuenow={s.pct}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 overflow-hidden rounded-full bg-subtle"
              >
                <div className={cn("h-full rounded-full", barColor(s.pct))} style={{ width: `${s.pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Resultado (Resultado.html): score, time, points, by topic and level, the questions and what's next. */
export function ResultView() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const userId = useAuth().user?.id;
  const attemptId = params.get("tentativa");
  const local = useLocalAttempts();
  const server = useServerAttempts();
  const tests = useTests();
  const summaries = useSummaries().data ?? [];
  const files = useFiles().data ?? [];
  const notebookPages = useNotebookDocuments().data ?? [];
  useAttemptSync();
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const subjects = useSubjects().data ?? [];

  const mine = local.data?.find((a) => a.attempt.id === attemptId);
  const remote = server.data?.find((a) => a.id === attemptId);
  const questionIds = mine?.attempt.questionIds ?? remote?.question_ids;
  const questions = useQuestionsByIds(questionIds);
  const remoteAnswers = useAnswers(!mine && remote ? remote.id : null);
  const testId = mine?.attempt.testId ?? remote?.test_id;
  const test = tests.data?.find((t) => t.id === testId);
  // Offline, right after the test: its questions, kept on the device, once the cache is restored.
  const testQuestions = useTestQuestions(testId ?? null, test?.question_ids);
  const fromTest = testQuestions.data && new Map(testQuestions.data.map((q) => [q.id, q]));
  const fallback =
    fromTest && questionIds?.every((id) => fromTest.has(id)) ? questionIds.map((id) => fromTest.get(id)!) : undefined;
  // Last, the copy the attempt keeps on this device (offline right after the test).
  const questionList = questions.data ?? fallback ?? mine?.attempt.questions;

  if (!attemptId || (local.data && server.data && !mine && !remote)) {
    return (
      <EmptyState
        icon={ListChecks}
        title="Resultado não encontrado"
        description="A tentativa pode ter sido excluída."
        action={
          <Link href="/estudo" className={buttonClasses("secondary", "m")}>
            Voltar para Resumos e testes
          </Link>
        }
      />
    );
  }
  const answers: Record<string, Answer> | undefined = mine ? mine.attempt.answers : remoteAnswers.data;
  if (!questionList || !answers || (!mine && !remote)) {
    return <div aria-busy className="h-60 animate-pulse rounded-xl bg-surface-alt motion-reduce:animate-none" />;
  }

  const list = questionList;
  const startedAt = mine ? new Date(mine.attempt.startedAt).toISOString() : remote!.started_at;
  const finishedAt = mine?.attempt.finishedAt
    ? new Date(mine.attempt.finishedAt).toISOString()
    : (remote?.finished_at ?? startedAt);
  const score = mine?.attempt.serverScore ?? remote?.score ?? scoreOf(list, answers);
  const mode = mine?.attempt.mode ?? remote!.mode;
  const waiting = mine !== undefined && !mine.sent;

  // Every finished attempt she has (on the server and only here), for the points and the history.
  const finished: FinishedAttempt[] = [
    ...(server.data ?? []).map((a) => ({
      id: a.id,
      testId: a.test_id,
      finishedAt: a.finished_at!,
      score: a.score ?? 0,
    })),
    ...(local.data ?? [])
      .filter((l) => l.attempt.finishedAt !== null && !(server.data ?? []).some((s) => s.id === l.attempt.id))
      .map((l) => ({
        id: l.attempt.id,
        testId: l.attempt.testId,
        finishedAt: new Date(l.attempt.finishedAt!).toISOString(),
        score: l.attempt.serverScore ?? score,
      })),
  ];
  const self = { id: attemptId, testId: testId!, finishedAt, score };
  const history = finished.filter((a) => a.testId === testId).sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
  const index = history.findIndex((a) => a.id === attemptId);
  const previous = index > 0 ? history[index - 1] : null;
  const points = pointsFor(self, finished);
  const rightCount = list.filter((q) => creditOf(q, answers[q.id]) === 1).length;
  const wrong = wrongOnes(list, answers);
  const topics = byTopic(list, answers);
  const weak = topics.filter((t) => t.pct < REVIEW_BELOW).map((t) => t.label);
  const today = todayIn(new Date());
  const when = `${shortDay(finishedAt, today)}, ${new Date(finishedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h")}`;
  const fileName = (documentId: string) =>
    files.find((f) => f.document?.id === documentId)?.name.replace(/\.[^.]+$/, "") ??
    notebookPages.find((p) => p.id === documentId)?.name ??
    null;

  // "Para revisar" leads to the same topic in a summary of the test, when there is one.
  const summaryIds = test?.config.sources?.summaryIds ?? mine?.attempt.summaryIds ?? [];
  const sourceSummaries = summaries.filter((s) => summaryIds.includes(s.id));
  const topicLink = (label: string) => {
    for (const s of sourceSummaries) {
      const topic = s.content.topicos.find((t) => topicKey(t.titulo) === topicKey(label));
      if (topic) return `/estudo/resumo/${s.id}#topico-${topic.id}`;
    }
    return null;
  };

  async function redoWrong() {
    if (!test) return;
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
      const id = await createRedoTest({
        test,
        questions: list,
        answers: answers ?? {},
        attemptId: attemptId!,
        userId,
        queryClient,
      });
      if (id) router.push(`/estudo/fazer?teste=${id}`);
      else setBusy(false);
    } catch (error) {
      toast({ title: "Não foi possível criar o teste", description: friendlyError(error), tone: "danger" });
      setBusy(false);
    }
  }

  const weakHref = `/estudo/novo-teste?${new URLSearchParams({
    ...((test?.subject_id ?? mine?.attempt.subjectId)
      ? { materia: (test?.subject_id ?? mine?.attempt.subjectId)! }
      : {}),
    topicos: weak.join("|"),
  }).toString()}`;
  const shown = showAll ? list : wrong;

  return (
    <>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="type-page-title m-0 wrap-break-word">{test?.title ?? mine?.attempt.title ?? "Teste"}</h1>
          <p className="type-body mt-1 mb-0 text-fg-2">
            Tentativa {index + 1} · {when} · modo {mode === "treino" ? "Treino" : "Prova"}
            {waiting && <span className="font-semibold text-accent"> · Offline · será sincronizado</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Ver só as erradas" : "Ver todas as questões"}
          </Button>
          <Link href="/estudo" className={buttonClasses("ghost", "m")}>
            Voltar
          </Link>
        </div>
      </header>

      <section
        aria-label="Resultado"
        className="mb-5 flex flex-wrap items-center gap-x-7 gap-y-4 rounded-3xl bg-deep px-6 py-5 text-white"
      >
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold tracking-[1px] text-on-deep-2 uppercase">Resultado</span>
          <span className="font-serif text-[64px] leading-[68px] font-semibold tracking-[-2px] tabular-nums">
            {pctLabel(score)}
          </span>
          <span className="text-sm text-on-deep-2">
            {rightCount} de {list.length} corretas
          </span>
        </div>
        <div aria-hidden className="w-px self-stretch bg-white/15 max-md:hidden" />
        <ul className="m-0 flex list-none flex-wrap gap-7 p-0">
          <li className="flex flex-col gap-0.5">
            <span className="text-[22px] font-bold tabular-nums">
              {durationLabel(Date.parse(finishedAt) - Date.parse(startedAt))}
            </span>
            <span className="text-xs text-on-deep-2">tempo</span>
          </li>
          <li className="flex flex-col gap-0.5">
            <span className="text-[22px] font-bold tabular-nums">{points > 0 ? `+${points} pts` : "0 pts"}</span>
            <span className="text-xs text-on-deep-2">{points > 0 ? "no ranking" : "já contou hoje"}</span>
          </li>
          {previous && (
            <li className="flex flex-col gap-0.5">
              <span className="text-[22px] font-bold tabular-nums">
                {score - previous.score >= 0 ? "+" : "−"}
                {Math.abs(Math.round(score - previous.score))} p.p.
              </span>
              <span className="text-xs text-on-deep-2">vs. tentativa anterior</span>
            </li>
          )}
        </ul>
        <div className="flex-1" />
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={wrong.length === 0 || busy || !test}
            onClick={() => void redoWrong()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-ink disabled:opacity-50"
          >
            <RotateCcw aria-hidden size={16} strokeWidth={1.75} />
            Refazer só as erradas
          </button>
          {weak.length > 0 && (
            <Link
              href={weakHref}
              className="inline-flex h-11 items-center justify-center rounded-full border border-[#9FB3C0] px-5 text-sm font-semibold text-white no-underline"
            >
              Novo teste com os tópicos fracos
            </Link>
          )}
        </div>
      </section>

      <div className="mb-5 flex flex-col gap-5 lg:flex-row">
        <Bars title="Por tópico" stats={topics} link={topicLink} review />
        <Bars
          title="Por nível"
          stats={byLevel(list, answers).map((s) => ({ ...s, label: DIFFICULTY_LABELS[s.level] }))}
        />
      </div>

      <section className="mb-5 flex flex-col gap-1 rounded-card border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-base font-semibold">
            {showAll
              ? "Todas as questões"
              : wrong.length
                ? "Questões que você errou"
                : "Você acertou todas as questões"}
          </h2>
          <Button variant="ghost" size="s" icon={Download} onClick={() => setExporting(true)}>
            Exportar PDF
          </Button>
        </div>
        <ul className="m-0 list-none p-0">
          {shown.map((q) => {
            const n = list.indexOf(q) + 1;
            const a = answers[q.id];
            const credit = creditOf(q, a);
            return (
              <li key={q.id} className="flex items-start gap-3 border-t border-line py-3 first:border-t-0">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-subtle text-xs font-bold">
                  {n}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm leading-5 font-medium wrap-break-word">{q.statement}</span>
                  <span className={cn("text-[13px]", credit === 1 ? "text-success-text" : "text-danger-text")}>
                    Sua resposta: {answerText(q, a)}
                    {q.type === "resposta_curta" && a?.selfAssessment ? ` (${a.selfAssessment})` : ""}
                  </span>
                  {credit < 1 && <span className="text-[13px] text-success-text">Correta: {correctText(q)}</span>}
                  {q.explanation && <span className="text-[13px] text-fg-2">{q.explanation}</span>}
                </span>
                {q.source && (
                  <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-sm bg-surface-alt px-2 text-xs font-medium text-accent">
                    <FileText aria-hidden size={13} strokeWidth={1.75} />
                    {fileName(q.source.documentId) ? `${fileName(q.source.documentId)} · ` : ""}p. {q.source.page}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {history.length > 1 && (
        <section
          className="mb-5 flex flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card"
          aria-label="Suas tentativas"
        >
          <h2 className="m-0 text-base font-semibold">Suas tentativas</h2>
          <ol className="m-0 flex list-none items-end gap-3 overflow-x-auto p-0">
            {history.map((h, i) => (
              <li key={h.id} className="flex w-14 shrink-0 flex-col items-center gap-1">
                <span className="text-xs font-bold tabular-nums">{Math.round(h.score)}%</span>
                <span className="flex h-24 w-6 items-end overflow-hidden rounded-md bg-subtle" aria-hidden>
                  <span
                    className={cn("w-full rounded-md", h.id === attemptId ? "bg-btn" : "bg-brand/50")}
                    style={{ height: `${Math.max(4, h.score)}%` }}
                  />
                </span>
                <span className="text-[11px] text-fg-2">{formatDate(todayIn(new Date(h.finishedAt))).slice(0, 5)}</span>
                <span className="sr-only">Tentativa {i + 1}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      <AiDisclaimer />
      {exporting && (
        <TestPdfSheet
          open
          onClose={() => setExporting(false)}
          title={test?.title ?? mine?.attempt.title ?? "Teste"}
          subjectName={subjects.find((s) => s.id === (test?.subject_id ?? mine?.attempt.subjectId))?.name ?? null}
          questions={list}
        />
      )}
    </>
  );
}
