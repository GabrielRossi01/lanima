"use client";

import { ChevronRight, FilePlus2, Info, ListChecks, Play, Plus, RotateCcw, Sparkles, Target } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { FilterChip, SubjectChip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { IconTile } from "@/components/ui/icon-tile";
import { PageHeader } from "@/components/layout/page-header";
import { useSubjects } from "@/features/subjects/queries";
import { remainingLabel } from "@/lib/ai/messages";
import { cn } from "@/lib/cn";
import { todayIn } from "@/lib/dates/calendar";
import { subjectIcon } from "@/lib/subjects/icons";
import type { Subject } from "@/lib/subjects/subjects";
import { AI_DISCLAIMER, plural, shortDay } from "@/lib/study/format";
import { newTestHref, parseIds } from "@/lib/study/links";
import { NewSummarySheet } from "./new-summary-sheet";
import { useAiRemaining, useSummaries, type Summary } from "./queries";
import { useTests, type SavedTest } from "./test-queries";
import { DifficultyBadge } from "@/components/ui/difficulty-badge";
import { DIFFICULTIES } from "@/lib/ai/schemas";
import { pctLabel } from "@/lib/study/grading";
import { useAttemptSync } from "./attempts";
import { latestByTest, useFinishedAttempts, useReviewTopics, type LastAttempt, type ReviewTopic } from "./review";

const ALL = "todas";

export function AiDisclaimer({ className }: { className?: string }) {
  return (
    <p className={cn("m-0 flex items-center gap-1.5 text-xs text-fg-2", className)}>
      <Info aria-hidden size={14} strokeWidth={1.75} className="shrink-0" />
      {AI_DISCLAIMER}
    </p>
  );
}

function SummaryRow({ summary, subject, today }: { summary: Summary; subject: Subject | undefined; today: string }) {
  const topics = summary.content.topicos.length;
  const files = summary.document_ids.length;
  return (
    <Link
      href={`/estudo/resumo/${summary.id}`}
      className="flex items-start gap-3.5 rounded-[18px] border border-line bg-surface p-4 text-fg no-underline hover:bg-surface-alt"
    >
      <IconTile icon={subjectIcon(subject?.icon)} color={subject?.color ?? "brand"} size={48} />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[15px] font-semibold wrap-break-word">{summary.title}</span>
        <span className="flex flex-wrap items-center gap-2">
          {subject && (
            <SubjectChip color={subject.color} size="s">
              {subject.name}
            </SubjectChip>
          )}
          <span className="text-xs text-fg-2">
            {plural(topics, "tópico", "tópicos")} · {plural(files, "arquivo", "arquivos")} ·{" "}
            {shortDay(summary.created_at, today)}
            {summary.edited_by_user && " · editado por você"}
          </span>
        </span>
      </span>
      <ChevronRight aria-hidden size={20} strokeWidth={1.75} className="mt-3 shrink-0 text-fg-2" />
    </Link>
  );
}

/** A saved test (Estudo.html): its levels, the last score, "Resultado" and "Refazer". */
function TestRow({
  test,
  subject,
  last,
  today,
}: {
  test: SavedTest;
  subject: Subject | undefined;
  last: LastAttempt | undefined;
  today: string;
}) {
  const counts = test.config.counts;
  return (
    <article aria-label={test.title} className="flex flex-col gap-2.5 rounded-[18px] border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[15px] font-semibold wrap-break-word">{test.title}</span>
          <span className="flex flex-wrap items-center gap-1.5">
            {subject && (
              <SubjectChip color={subject.color} size="s">
                {subject.name}
              </SubjectChip>
            )}
            {counts &&
              DIFFICULTIES.filter((d) => (counts[d] ?? 0) > 0).map((d) => <DifficultyBadge key={d} level={d} />)}
          </span>
        </span>
        {last && (
          <span className="flex shrink-0 flex-col items-end">
            <span className="font-serif text-[26px] leading-[30px] font-semibold tabular-nums">
              {last.score >= 0 ? pctLabel(last.score) : "…"}
            </span>
            <span className="text-xs text-fg-2">
              {last.waiting ? "a sincronizar" : shortDay(last.finishedAt, today)}
            </span>
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-fg-2">
          {plural(test.question_ids.length, "questão", "questões")}
          {!last && ` · criado ${shortDay(test.created_at, today)}`}
        </span>
        <span className="flex gap-2">
          {last && (
            <Link href={`/estudo/resultado?tentativa=${last.id}`} className={buttonClasses("ghost", "s")}>
              Resultado
            </Link>
          )}
          <Link href={`/estudo/fazer?teste=${test.id}`} className={buttonClasses("secondary", "s")}>
            {last ? (
              <RotateCcw aria-hidden size={16} strokeWidth={1.75} />
            ) : (
              <Play aria-hidden size={16} strokeWidth={1.75} />
            )}
            {last ? "Refazer" : "Começar"}
          </Link>
        </span>
      </div>
    </article>
  );
}

/** Topics under 60% in her latest tests, and a test only with them. */
function ReviewCard({ topics, subjects }: { topics: ReviewTopic[]; subjects: Subject[] }) {
  const bySubject = new Map(subjects.map((s) => [s.id, s]));
  const subjectIds = [...new Set(topics.map((t) => t.subjectId))];
  const href = `/estudo/novo-teste?${new URLSearchParams({
    ...(subjectIds.length === 1 && subjectIds[0] ? { materia: subjectIds[0] } : {}),
    topicos: topics.map((t) => t.label).join("|"),
  }).toString()}`;
  return (
    <section
      aria-label="Para revisar"
      className="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-4 shadow-card"
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        <Target aria-hidden size={18} strokeWidth={1.75} className="text-danger" />
        Para revisar
      </span>
      <span className="text-[13px] leading-[18px] text-fg-2">Tópicos com menos de 60% nos últimos testes.</span>
      <div className="flex flex-wrap gap-1.5">
        {topics.map((t) => {
          const subject = bySubject.get(t.subjectId ?? "");
          return subject ? (
            <SubjectChip key={t.label} color={subject.color} size="s">
              {t.label} · {t.pct}%
            </SubjectChip>
          ) : (
            <span
              key={t.label}
              className="inline-flex h-6 items-center rounded-full bg-subtle px-2.5 text-xs font-medium"
            >
              {t.label} · {t.pct}%
            </span>
          );
        })}
      </div>
      <Link href={href} className={cn(buttonClasses("secondary", "s"), "self-start")}>
        <ListChecks aria-hidden size={16} strokeWidth={1.75} />
        Teste só com esses tópicos
      </Link>
    </section>
  );
}

function Column({ title, action, children }: { title: string; action: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-1 flex-col gap-3" aria-label={title}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * The two columns of Resumos e testes, for every subject (ALL) or one: summaries, tests with their
 * last score, and "Para revisar". Also the subject page's "Resumos e testes" tab.
 */
export function StudyColumns({ subject, onNewSummary }: { subject: string; onNewSummary: () => void }) {
  const summaries = useSummaries();
  const subjects = useSubjects().data ?? [];
  const today = todayIn(new Date());
  const bySubject = new Map(subjects.map((s) => [s.id, s]));
  const list = (summaries.data ?? []).filter((s) => subject === ALL || s.subject_id === subject);
  const tests = useTests();
  const testList = (tests.data ?? []).filter((t) => subject === ALL || t.subject_id === subject);
  const testHref = newTestHref({ subjectId: subject === ALL ? null : subject });
  // Attempts finished offline go up when this screen opens or the network is back.
  useAttemptSync();
  const latest = latestByTest(useFinishedAttempts().data ?? []);
  const review = useReviewTopics().filter((t) => subject === ALL || t.subjectId === subject);

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <Column
        title="Resumos"
        action={
          <Button variant="ghost" size="s" icon={Plus} onClick={onNewSummary}>
            Novo resumo
          </Button>
        }
      >
        {!summaries.data ? (
          <div aria-busy className="flex flex-col gap-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-[18px] bg-surface-alt motion-reduce:animate-none" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={FilePlus2}
            title="Nenhum resumo ainda"
            description="Escolha arquivos já enviados e receba um resumo em tópicos, com a página de cada ponto."
            action={
              <Button variant="secondary" onClick={onNewSummary}>
                Fazer um resumo
              </Button>
            }
          />
        ) : (
          list.map((s) => (
            <SummaryRow key={s.id} summary={s} subject={bySubject.get(s.subject_id ?? "")} today={today} />
          ))
        )}
      </Column>
      <Column
        title="Testes"
        action={
          <Link href={testHref} className={buttonClasses("ghost", "s")}>
            <Plus aria-hidden size={16} strokeWidth={1.75} />
            Novo teste
          </Link>
        }
      >
        {tests.data && testList.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Nenhum teste ainda"
            description="Crie um teste com os níveis e os tipos de questão que quiser, a partir de arquivos ou resumos."
          />
        ) : (
          testList.map((t) => (
            <TestRow
              key={t.id}
              test={t}
              subject={bySubject.get(t.subject_id ?? "")}
              last={latest.get(t.id)}
              today={today}
            />
          ))
        )}
        {review.length > 0 && <ReviewCard topics={review} subjects={subjects} />}
      </Column>
    </div>
  );
}

/** Resumos e testes (Estudo.html): her summaries and tests, by subject, and what to review. */
export function StudyView() {
  const router = useRouter();
  const params = useSearchParams();
  const summaries = useSummaries();
  const subjects = useSubjects().data ?? [];
  const remaining = useAiRemaining().data;
  const [subject, setSubject] = useState(ALL);
  // "?resumir=<ids>": from Arquivos ("Resumir em tópicos"), the sheet opens with those files chosen.
  const [fromFiles] = useState(() => parseIds(params.get("resumir")));
  // "?paginas=<ids>": from the notebook ("Usar no resumo"), with the readings of those pages.
  const [fromPages] = useState(() => parseIds(params.get("paginas")));
  const [newSummary, setNewSummary] = useState(fromFiles.length + fromPages.length > 0);
  const tests = useTests();
  const used = subjects.filter(
    (s) =>
      (summaries.data ?? []).some((x) => x.subject_id === s.id) ||
      (tests.data ?? []).some((x) => x.subject_id === s.id),
  );
  const testHref = newTestHref({ subjectId: subject === ALL ? null : subject });

  function closeSheet() {
    setNewSummary(false);
    // Reloading doesn't open it again.
    if (params.get("resumir") || params.get("paginas")) router.replace("/estudo", { scroll: false });
  }

  return (
    <>
      <PageHeader
        title="Resumos e testes"
        subtitle="Envie arquivos, receba um resumo em tópicos e teste o que aprendeu"
        actions={
          <>
            {remaining && (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-alt px-3.5 text-[13px] font-semibold text-accent">
                <Sparkles aria-hidden size={15} strokeWidth={1.75} />
                {remainingLabel(remaining.summaries + remaining.questionRuns)}
              </span>
            )}
            <Button variant="secondary" icon={FilePlus2} onClick={() => setNewSummary(true)}>
              Novo resumo
            </Button>
            <Link href={testHref} className={buttonClasses("primary", "m")}>
              <ListChecks aria-hidden size={18} strokeWidth={1.75} />
              Novo teste
            </Link>
          </>
        }
      />

      {used.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filtrar por matéria">
          <FilterChip selected={subject === ALL} onClick={() => setSubject(ALL)}>
            Todas as matérias
          </FilterChip>
          {used.map((s) => (
            <FilterChip key={s.id} selected={subject === s.id} onClick={() => setSubject(s.id)}>
              {s.name}
            </FilterChip>
          ))}
        </div>
      )}

      <StudyColumns subject={subject} onNewSummary={() => setNewSummary(true)} />
      <AiDisclaimer className="mt-6" />
      {newSummary && (
        <NewSummarySheet
          open
          onClose={closeSheet}
          subjectId={subject === ALL || fromFiles.length + fromPages.length > 0 ? null : subject}
          fileIds={fromFiles}
          pageDocumentIds={fromPages}
        />
      )}
    </>
  );
}

/** Aba "Resumos e testes" da matéria: the same columns, only for this subject. */
export function SubjectStudyTab({ subjectId }: { subjectId: string }) {
  const [newSummary, setNewSummary] = useState(false);
  return (
    <>
      <StudyColumns subject={subjectId} onNewSummary={() => setNewSummary(true)} />
      <AiDisclaimer className="mt-6" />
      {newSummary && <NewSummarySheet open onClose={() => setNewSummary(false)} subjectId={subjectId} />}
    </>
  );
}
