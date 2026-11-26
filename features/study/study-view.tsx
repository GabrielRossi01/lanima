"use client";

import { ChevronRight, FilePlus2, Info, ListChecks, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
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
import { NewSummarySheet } from "./new-summary-sheet";
import { useAiRemaining, useSummaries, type Summary } from "./queries";
import { useTests, type SavedTest } from "./test-queries";
import { DifficultyBadge } from "@/components/ui/difficulty-badge";
import { DIFFICULTIES } from "@/lib/ai/schemas";

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

/** A saved test: name, subject, its levels and size. Score and "Refazer" come with taking tests. */
function TestRow({ test, subject, today }: { test: SavedTest; subject: Subject | undefined; today: string }) {
  const counts = test.config.counts;
  return (
    <div className="flex flex-col gap-2.5 rounded-[18px] border border-line bg-surface p-4">
      <span className="text-[15px] font-semibold wrap-break-word">{test.title}</span>
      <span className="flex flex-wrap items-center gap-1.5">
        {subject && (
          <SubjectChip color={subject.color} size="s">
            {subject.name}
          </SubjectChip>
        )}
        {counts && DIFFICULTIES.filter((d) => (counts[d] ?? 0) > 0).map((d) => <DifficultyBadge key={d} level={d} />)}
      </span>
      <span className="text-xs text-fg-2">
        {plural(test.question_ids.length, "questão", "questões")} · {shortDay(test.created_at, today)}
      </span>
    </div>
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

/** Resumos e testes (Estudo.html): her summaries and tests, by subject, and what to review. */
export function StudyView() {
  const summaries = useSummaries();
  const subjects = useSubjects().data ?? [];
  const remaining = useAiRemaining().data;
  const [subject, setSubject] = useState(ALL);
  const [newSummary, setNewSummary] = useState(false);
  const today = todayIn(new Date());
  const bySubject = new Map(subjects.map((s) => [s.id, s]));
  const list = (summaries.data ?? []).filter((s) => subject === ALL || s.subject_id === subject);
  const tests = useTests();
  const testList = (tests.data ?? []).filter((t) => subject === ALL || t.subject_id === subject);
  const used = subjects.filter(
    (s) =>
      (summaries.data ?? []).some((x) => x.subject_id === s.id) ||
      (tests.data ?? []).some((x) => x.subject_id === s.id),
  );
  const newTestHref = subject === ALL ? "/estudo/novo-teste" : `/estudo/novo-teste?materia=${subject}`;

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
            <Link href={newTestHref} className={buttonClasses("primary", "m")}>
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

      <div className="flex flex-col gap-5 lg:flex-row">
        <Column
          title="Resumos"
          action={
            <Button variant="ghost" size="s" icon={Plus} onClick={() => setNewSummary(true)}>
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
                <Button variant="secondary" onClick={() => setNewSummary(true)}>
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
            <Link href={newTestHref} className={buttonClasses("ghost", "s")}>
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
              <TestRow key={t.id} test={t} subject={bySubject.get(t.subject_id ?? "")} today={today} />
            ))
          )}
        </Column>
      </div>
      <AiDisclaimer className="mt-6" />
      {newSummary && (
        <NewSummarySheet open onClose={() => setNewSummary(false)} subjectId={subject === ALL ? null : subject} />
      )}
    </>
  );
}
