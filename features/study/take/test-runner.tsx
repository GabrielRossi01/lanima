"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Bookmark, ChevronLeft, ChevronRight, Clock, ListChecks, Timer } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DifficultyBadge } from "@/components/ui/difficulty-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useAuth } from "@/features/auth/auth-provider";
import { useFiles } from "@/features/files/queries";
import { useTimerStore } from "@/features/focus/timer-store";
import { useSubjects } from "@/features/subjects/queries";
import { DIFFICULTIES } from "@/lib/ai/schemas";
import { cn } from "@/lib/cn";
import { formatClock, start, statusOf, remainingMs } from "@/lib/focus/timer";
import { isAnswered, optionOrder, type Response, type SelfAssessment } from "@/lib/study/grading";
import { plural } from "@/lib/study/format";
import {
  deleteLocalAttempt,
  emptyAnswer,
  localAttemptsKey,
  newAttempt,
  saveAttempt,
  sendAttempts,
  attemptsKey,
  useAttemptSync,
  useLocalAttempts,
  useTestQuestions,
  type LocalAttempt,
} from "../attempts";
import { useTests, type Question } from "../test-queries";
import { Feedback, QuestionView, SelfAssessmentButtons } from "./question-view";

type Mode = "treino" | "prova";

/** The time, read only in event handlers and timers (never while rendering). */
function clock() {
  return Date.now();
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

/** "Foco junto" (section 7.5): starts the focus timer with the test's subject, without leaving. */
function FocusTogether({ subjectId }: { subjectId: string | null }) {
  const timer = useTimerStore((s) => s.timer);
  const ready = useTimerStore((s) => s.ready);
  const now = useNow(statusOf(timer) === "running");
  if (statusOf(timer) !== "idle") {
    return (
      <Link href="/foco" className={buttonClasses("secondary", "s")}>
        <Timer aria-hidden size={16} strokeWidth={1.75} />
        Foco · {formatClock(remainingMs(timer, now))}
      </Link>
    );
  }
  return (
    <Button
      variant="secondary"
      size="s"
      icon={Timer}
      disabled={!ready}
      onClick={() =>
        useTimerStore
          .getState()
          .act((t, at) => (statusOf(t) === "idle" ? start({ ...t, subjectId, topicId: null }, at) : t))
      }
    >
      Foco junto
    </Button>
  );
}

function QuestionMap({
  questions,
  attempt,
  onGo,
}: {
  questions: Question[];
  attempt: LocalAttempt;
  onGo: (index: number) => void;
}) {
  return (
    <nav aria-label="Mapa de questões" className="flex shrink-0 flex-col gap-2.5 md:w-[200px]">
      <span className="text-xs font-semibold tracking-[1px] text-fg-2 uppercase">Questões</span>
      <ol className="m-0 grid list-none grid-cols-[repeat(auto-fill,40px)] gap-1.5 p-0 md:grid-cols-5">
        {questions.map((q, i) => {
          const answer = attempt.answers[q.id];
          const answered = isAnswered(q, answer);
          const current = i === attempt.current;
          return (
            <li key={q.id}>
              <button
                type="button"
                onClick={() => onGo(i)}
                aria-current={current ? "step" : undefined}
                aria-label={`Questão ${i + 1}${answered ? ", respondida" : ", em branco"}${answer?.marked ? ", marcada para revisar" : ""}`}
                className={cn(
                  "relative flex size-10 items-center justify-center rounded-lg text-[13px] font-semibold tabular-nums",
                  current ? "bg-btn text-white" : answered ? "bg-active text-accent" : "bg-subtle text-fg-2",
                )}
              >
                {i + 1}
                {answer?.marked && (
                  <span aria-hidden className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-warning" />
                )}
              </button>
            </li>
          );
        })}
      </ol>
      <ul className="m-0 hidden list-none flex-col gap-1.5 p-0 text-xs text-fg-2 md:flex">
        {[
          ["bg-active", "Respondida"],
          ["bg-btn", "Atual"],
          ["bg-subtle", "Em branco"],
          ["bg-warning rounded-full", "Marcada para revisar"],
        ].map(([color, label]) => (
          <li key={label} className="flex items-center gap-2">
            <span aria-hidden className={cn("size-3 rounded-[4px]", color)} />
            {label}
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Taking a test (Questao.html): one question at a time, map, training feedback or exam clock. */
export function TestRunner() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const userId = useAuth().user?.id;
  const testId = params.get("teste");
  const tests = useTests();
  const test = tests.data?.find((t) => t.id === testId);
  const questions = useTestQuestions(testId, test?.question_ids);
  const local = useLocalAttempts();
  const subjects = useSubjects().data ?? [];
  const files = useFiles().data ?? [];
  useAttemptSync();

  const [attempt, setAttempt] = useState<LocalAttempt | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  // When she arrived at the current question; set when the attempt begins.
  const enteredAt = useRef(0);
  const finishing = useRef(false);

  const list = questions.data ?? [];
  const byId = new Map(list.map((q) => [q.id, q]));
  const unfinished = local.data?.find((a) => a.attempt.testId === testId && a.attempt.finishedAt === null)?.attempt;
  const chosenMode: Mode = mode ?? test?.config.mode ?? "treino";
  const now = useNow(attempt !== null && attempt.mode === "prova");
  const fileName = (documentId: string) =>
    files.find((f) => f.document?.id === documentId)?.name.replace(/\.[^.]+$/, "") ?? null;

  function update(next: LocalAttempt) {
    setAttempt(next);
    if (userId) void saveAttempt(userId, next);
  }

  /** Time on the current question, added when she leaves it. */
  function withTime(a: LocalAttempt): LocalAttempt {
    const id = a.questionIds[a.current];
    const at = clock();
    const spent = enteredAt.current ? at - enteredAt.current : 0;
    enteredAt.current = at;
    const answer = a.answers[id] ?? emptyAnswer();
    return { ...a, answers: { ...a.answers, [id]: { ...answer, timeMs: answer.timeMs + spent } } };
  }

  function go(index: number) {
    if (!attempt) return;
    update({ ...withTime(attempt), current: Math.max(0, Math.min(index, attempt.questionIds.length - 1)) });
  }

  function patchAnswer(change: Partial<LocalAttempt["answers"][string]>) {
    if (!attempt) return;
    const id = attempt.questionIds[attempt.current];
    const answer = attempt.answers[id] ?? emptyAnswer();
    update({ ...attempt, answers: { ...attempt.answers, [id]: { ...answer, ...change } } });
  }

  async function finish(from: LocalAttempt) {
    if (finishing.current || !userId) return;
    finishing.current = true;
    const done = { ...withTime(from), finishedAt: clock() };
    await saveAttempt(userId, done);
    void queryClient.invalidateQueries({ queryKey: localAttemptsKey(userId) });
    // Sent now if there is network; otherwise later (useAttemptSync).
    void sendAttempts(userId).then((sent) => {
      if (sent > 0) {
        void queryClient.invalidateQueries({ queryKey: attemptsKey(userId) });
        void queryClient.invalidateQueries({ queryKey: localAttemptsKey(userId) });
      }
    });
    const result = `/estudo/resultado?tentativa=${done.id}`;
    // Offline the app can't fetch the next page's data, and Next's fallback sometimes reloads this
    // page instead: go straight to the result, which the service worker keeps (app/sw.ts).
    if (navigator.onLine) router.replace(result);
    else window.location.replace(result);
  }

  const shortAnswers = attempt
    ? attempt.questionIds.map((id) => byId.get(id)).filter((q): q is Question => q?.type === "resposta_curta")
    : [];

  /** Exam: short answers are judged by her before the result (no AI: section 7.5). */
  function deliver() {
    if (!attempt) return;
    setConfirmFinish(false);
    const answeredShort = shortAnswers.filter((q) => isAnswered(q, attempt.answers[q.id]));
    if (answeredShort.length > 0) {
      update(withTime(attempt));
      setReviewing(true);
    } else {
      void finish(attempt);
    }
  }

  // The exam clock: when it runs out, what there is gets delivered.
  const limitMs = attempt?.mode === "prova" && attempt.timeLimitMin ? attempt.timeLimitMin * 60_000 : null;
  const deadline = limitMs !== null && attempt ? attempt.startedAt + limitMs : null;
  const left = deadline !== null ? deadline - now : null;
  const onTimeUp = useRef<() => void>(() => {});
  useEffect(() => {
    onTimeUp.current = () => {
      if (reviewing || finishing.current) return;
      setTimeUp(true);
      deliver();
    };
  });
  useEffect(() => {
    if (deadline === null) return;
    const id = window.setTimeout(() => onTimeUp.current(), Math.max(0, deadline - clock()));
    return () => window.clearTimeout(id);
  }, [deadline]);

  if (!testId || (tests.data && !test)) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl items-center p-6">
        <EmptyState
          icon={ListChecks}
          title="Teste não encontrado"
          description="Ele pode ter sido excluído."
          action={
            <Link href="/estudo" className={buttonClasses("secondary", "m")}>
              Voltar para Resumos e testes
            </Link>
          }
        />
      </main>
    );
  }
  if (!test || !questions.data || !local.data) {
    return <div aria-busy className="m-6 h-60 animate-pulse rounded-xl bg-surface-alt motion-reduce:animate-none" />;
  }
  const subject = subjects.find((s) => s.id === test.subject_id);

  // --- Start or resume ---
  if (!attempt) {
    const counts = test.config.counts;
    const begin = (resume: LocalAttempt | null) => {
      enteredAt.current = clock();
      if (resume) return setAttempt(resume);
      const fresh = newAttempt({
        testId: test.id,
        mode: chosenMode,
        questionIds: list.map((q) => q.id),
        shuffle: test.config.shuffle ?? true,
        timeLimitMin: chosenMode === "prova" ? (test.config.timeLimitMin ?? null) : null,
        title: test.title,
        subjectId: test.subject_id,
        summaryIds: test.config.sources?.summaryIds ?? [],
        questions: list,
      });
      update(fresh);
    };
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-5 px-4 py-8">
        <Link
          href="/estudo"
          className="inline-flex h-11 items-center gap-1.5 self-start text-sm font-semibold no-underline"
        >
          <ChevronLeft aria-hidden size={18} />
          Resumos e testes
        </Link>
        <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-6 shadow-card md:p-7">
          <p className="m-0 text-[13px] text-fg-2">{subject ? `Teste · ${subject.name}` : "Teste"}</p>
          <h1 className="m-0 font-serif text-[28px] leading-9 font-semibold tracking-[-0.5px]">{test.title}</h1>
          <div className="flex flex-wrap items-center gap-1.5">
            {DIFFICULTIES.filter((d) => (counts?.[d] ?? 0) > 0).map((d) => (
              <DifficultyBadge key={d} level={d} />
            ))}
            <span className="text-sm text-fg-2">{plural(list.length, "questão", "questões")}</span>
          </div>
          {list.length < test.question_ids.length && (
            <p className="m-0 text-[13px] text-warning-text">
              {plural(test.question_ids.length - list.length, "questão foi excluída", "questões foram excluídas")} do
              seu banco e não entram.
            </p>
          )}
          {unfinished ? (
            <p className="m-0 text-sm text-fg-2">
              Você parou na questão {unfinished.current + 1} de {unfinished.questionIds.length}, no modo{" "}
              {unfinished.mode === "treino" ? "Treino" : "Prova"}.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold">Modo</span>
              <SegmentedControl
                label="Modo"
                options={[
                  { value: "treino", label: "Treino" },
                  { value: "prova", label: "Prova" },
                ]}
                value={chosenMode}
                onChange={setMode}
              />
              <span className="text-xs text-fg-2">
                {chosenMode === "treino"
                  ? "Correção e explicação a cada questão."
                  : test.config.timeLimitMin
                    ? `Resultado só no fim, com ${test.config.timeLimitMin} minutos.`
                    : "Resultado só no fim."}
              </span>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {unfinished ? (
              <>
                <Button icon={ChevronRight} iconPosition="end" onClick={() => begin(unfinished)}>
                  Continuar de onde parou
                </Button>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    // The unfinished one was never sent (only finished attempts go): nothing to undo on the server.
                    if (userId) await deleteLocalAttempt(userId, unfinished.id);
                    void queryClient.invalidateQueries({ queryKey: localAttemptsKey(userId) });
                    begin(null);
                  }}
                >
                  Começar de novo
                </Button>
              </>
            ) : (
              <Button icon={ChevronRight} iconPosition="end" disabled={list.length === 0} onClick={() => begin(null)}>
                Começar
              </Button>
            )}
          </div>
        </section>
      </main>
    );
  }

  const ordered = attempt.questionIds.map((id) => byId.get(id)).filter((q): q is Question => Boolean(q));
  const q = ordered[attempt.current];
  const answer = q ? attempt.answers[q.id] : undefined;
  const last = attempt.current === ordered.length - 1;
  const order = q ? optionOrder(q, attempt.id, attempt.shuffle) : [];
  const answeredCount = ordered.filter((x) => isAnswered(x, attempt.answers[x.id])).length;
  const blanks = ordered.length - answeredCount;
  const treino = attempt.mode === "treino";
  const confirmed = Boolean(answer?.confirmed);
  const needsSelf = q?.type === "resposta_curta" && confirmed && !answer?.selfAssessment;

  // --- Exam over: she judges her short answers ---
  if (reviewing) {
    const pending = shortAnswers.filter((x) => isAnswered(x, attempt.answers[x.id]));
    const allJudged = pending.every((x) => attempt.answers[x.id]?.selfAssessment);
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-4 py-8">
        <h1 className="m-0 font-serif text-[28px] leading-9 font-semibold">Corrija suas respostas curtas</h1>
        <p className="m-0 text-sm text-fg-2">
          {timeUp ? "O tempo acabou. " : ""}Compare o que você escreveu com a resposta esperada e diga como foi.
        </p>
        <ol className="m-0 flex list-none flex-col gap-4 p-0">
          {pending.map((x) => {
            const a = attempt.answers[x.id];
            const n = attempt.questionIds.indexOf(x.id) + 1;
            return (
              <li key={x.id} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5">
                <span className="text-xs font-semibold text-fg-2">Questão {n}</span>
                <p className="m-0 font-semibold">{x.statement}</p>
                <p className="m-0 text-sm">
                  <span className="font-semibold">Sua resposta: </span>
                  {String((a?.response as { text?: string } | null)?.text ?? "")}
                </p>
                <p className="m-0 text-sm text-success-text">
                  <span className="font-semibold">Esperada: </span>
                  {String(((x.answer ?? {}) as { text?: string }).text ?? "")}
                </p>
                <SelfAssessmentButtons
                  label={`Como foi a questão ${n}`}
                  value={a?.selfAssessment ?? null}
                  onChange={(v: SelfAssessment) =>
                    update({
                      ...attempt,
                      answers: { ...attempt.answers, [x.id]: { ...(a ?? emptyAnswer()), selfAssessment: v } },
                    })
                  }
                />
              </li>
            );
          })}
        </ol>
        <Button className="self-start" disabled={!allJudged} onClick={() => void finish(attempt)}>
          Ver resultado
        </Button>
      </main>
    );
  }

  if (!q) return null;

  const footer = (
    <>
      <Button
        variant="ghost"
        icon={ChevronLeft}
        disabled={attempt.current === 0}
        onClick={() => go(attempt.current - 1)}
      >
        Anterior
      </Button>
      <div className="flex flex-wrap items-center gap-2.5">
        {treino && !confirmed && !isAnswered(q, answer) && (
          <span className="text-[13px] text-fg-2">
            {q.type === "associacao"
              ? "Ligue todos os pares"
              : q.type === "resposta_curta"
                ? "Escreva sua resposta"
                : "Escolha uma alternativa"}
          </span>
        )}
        {treino && !confirmed && isAnswered(q, answer) && (
          <Button onClick={() => patchAnswer({ confirmed: true })}>Confirmar resposta</Button>
        )}
        {treino && confirmed && !last && (
          <Button icon={ChevronRight} iconPosition="end" disabled={needsSelf} onClick={() => go(attempt.current + 1)}>
            Próxima
          </Button>
        )}
        {treino && confirmed && last && (
          <Button disabled={needsSelf} onClick={() => void finish(attempt)}>
            Ver resultado
          </Button>
        )}
        {!treino && !last && (
          <Button icon={ChevronRight} iconPosition="end" onClick={() => go(attempt.current + 1)}>
            Próxima
          </Button>
        )}
        {!treino && (
          <Button
            variant={last ? "primary" : "secondary"}
            onClick={() => (blanks > 0 ? setConfirmFinish(true) : deliver())}
          >
            Entregar
          </Button>
        )}
      </div>
    </>
  );

  const feedback =
    treino && confirmed ? (
      <>
        <Feedback question={q} answer={answer} order={order} fileName={fileName} />
        {q.type === "resposta_curta" && (
          <SelfAssessmentButtons
            label="Como foi a sua resposta"
            value={answer?.selfAssessment ?? null}
            onChange={(v) => patchAnswer({ selfAssessment: v })}
          />
        )}
      </>
    ) : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[1280px] flex-col gap-5 px-4 py-5 md:px-8 md:py-6">
      <header className="flex flex-wrap items-center gap-3 md:gap-4">
        <Link
          href="/estudo"
          className="inline-flex h-11 items-center gap-1.5 pr-3.5 pl-1.5 text-sm font-semibold no-underline"
        >
          <ChevronLeft aria-hidden size={18} />
          Sair
        </Link>
        <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <span className="text-sm font-semibold">
            {test.title}
            <span className="font-medium text-fg-2">
              {" "}
              · Questão {attempt.current + 1} de {ordered.length} · {treino ? "Treino" : "Prova"}
            </span>
          </span>
          <div
            role="progressbar"
            aria-label="Questões respondidas"
            aria-valuenow={answeredCount}
            aria-valuemin={0}
            aria-valuemax={ordered.length}
            className="h-1.5 overflow-hidden rounded-full bg-subtle"
          >
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${(100 * answeredCount) / ordered.length}%` }}
            />
          </div>
        </div>
        {!treino && (
          <span
            className={cn(
              "inline-flex h-10 items-center gap-1.5 rounded-full bg-surface-alt px-3.5 text-sm font-semibold tabular-nums",
              left !== null && left < 60_000 ? "text-danger-text" : "text-accent",
            )}
            aria-label={left !== null ? "Tempo restante" : "Tempo de prova"}
          >
            <Clock aria-hidden size={16} strokeWidth={1.75} />
            {formatClock(left !== null ? Math.max(0, left) : now - attempt.startedAt)}
          </span>
        )}
        <FocusTogether subjectId={test.subject_id} />
        <button
          type="button"
          aria-pressed={Boolean(answer?.marked)}
          aria-label="Marcar para revisar"
          onClick={() => patchAnswer({ marked: !answer?.marked })}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full border",
            answer?.marked ? "border-warning bg-warning/15 text-warning-text" : "border-line bg-surface text-fg",
          )}
        >
          <Bookmark aria-hidden size={18} strokeWidth={1.75} fill={answer?.marked ? "currentColor" : "none"} />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-6 md:flex-row">
        <QuestionMap questions={ordered} attempt={attempt} onGo={go} />
        <QuestionView
          key={q.id}
          question={q}
          answer={answer}
          order={order}
          graded={treino && confirmed}
          onResponse={(response: Response) => !(treino && confirmed) && patchAnswer({ response })}
          feedback={feedback}
          footer={footer}
        />
      </div>
      <ConfirmDialog
        open={confirmFinish}
        title="Entregar a prova?"
        description={`${plural(blanks, "questão está", "questões estão")} em branco e ${blanks === 1 ? "conta" : "contam"} como erradas.`}
        confirmLabel="Entregar mesmo assim"
        onConfirm={deliver}
        onClose={() => setConfirmFinish(false)}
      />
    </main>
  );
}
