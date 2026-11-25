"use client";

import { BookOpen, FileUp, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilterChip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { SubjectCard } from "@/components/ui/subject-card";
import { todayIn } from "@/lib/dates/calendar";
import { useNow } from "@/lib/hooks/use-now";
import { subjectIcon } from "@/lib/subjects/icons";
import { formatSchedule } from "@/lib/subjects/schedule";
import {
  assessmentPill,
  isExam,
  matchesFilter,
  sortSummaries,
  summarize,
  type SubjectFilter,
  type SubjectSort,
} from "@/lib/subjects/subjects";
import { errorTag } from "@/lib/supabase/errors";
import { ImportSyllabusSheet } from "./import-syllabus-sheet";
import { useAssessments, useSubjects, useTopics } from "./queries";
import { SubjectFormSheet } from "./subject-form-sheet";

const FILTERS: readonly { value: SubjectFilter; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "prova", label: "Com prova próxima" },
  { value: "lab", label: "Com laboratório" },
  { value: "arquivadas", label: "Arquivadas" },
];

const SORTS: readonly { value: SubjectSort; label: string }[] = [
  { value: "proxima-aula", label: "Próxima aula" },
  { value: "proxima-avaliacao", label: "Próxima avaliação" },
  { value: "nome", label: "Nome" },
];

function SkeletonGrid() {
  return (
    <div aria-busy className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-64 animate-pulse rounded-card bg-surface-alt motion-reduce:animate-none" />
      ))}
    </div>
  );
}

/** Matérias (Materias.html): filters with counts, sort, grid of subject cards. */
export function SubjectsView() {
  const router = useRouter();
  const now = useNow();
  const subjects = useSubjects();
  const topics = useTopics();
  const assessments = useAssessments();
  const [filter, setFilter] = useState<SubjectFilter>("todas");
  const [sort, setSort] = useState<SubjectSort>("proxima-aula");
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const today = now ? todayIn(now) : null;
  const ready = subjects.data && topics.data && assessments.data && now && today;
  const summaries = ready ? summarize(subjects.data!, topics.data!, assessments.data!, today!) : [];
  const active = summaries.filter((s) => !s.subject.archived);
  const visible = ready
    ? sortSummaries(
        summaries.filter((s) => matchesFilter(s, filter, today!)),
        sort,
        now!,
        today!,
      )
    : [];
  const failed = subjects.error ?? topics.error ?? assessments.error;

  return (
    <>
      <PageHeader
        title="Matérias"
        subtitle={ready ? `Semestre atual · ${active.length} ${active.length === 1 ? "matéria" : "matérias"}` : " "}
        actions={
          <>
            <Button variant="secondary" icon={FileUp} onClick={() => setImporting(true)} disabled={active.length === 0}>
              Importar plano de ensino
            </Button>
            <Button icon={Plus} onClick={() => setCreating(true)}>
              Nova matéria
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar matérias">
          {FILTERS.map((f) => (
            <FilterChip
              key={f.value}
              selected={filter === f.value}
              count={ready ? summaries.filter((s) => matchesFilter(s, f.value, today!)).length : undefined}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </FilterChip>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-fg-2">
          Ordenar por:
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SubjectSort)}
            className="h-10 rounded-full border border-line-strong bg-surface px-3 text-sm font-semibold text-fg"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {failed && !ready ? (
        <Card>
          <p className="type-body m-0">Não foi possível carregar as matérias.</p>
          <p className="type-caption m-0 text-fg-2">matérias: {errorTag(failed)}</p>
          <Button
            variant="secondary"
            className="self-start"
            onClick={() => [subjects, topics, assessments].forEach((q) => void q.refetch())}
          >
            Tentar de novo
          </Button>
        </Card>
      ) : !ready ? (
        <SkeletonGrid />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={summaries.length === 0 ? "Nenhuma matéria ainda" : "Nenhuma matéria neste filtro"}
          description={
            summaries.length === 0
              ? "Crie as matérias do semestre para organizar conteúdo, provas e metas."
              : filter === "lab"
                ? "Marque “Laboratório” nas aulas de uma matéria para ela aparecer aqui."
                : undefined
          }
          action={
            summaries.length === 0 ? (
              <Button icon={Plus} onClick={() => setCreating(true)}>
                Nova matéria
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
          {visible.map(({ subject, progress, next }) => (
            <li key={subject.id} className="min-w-0">
              <SubjectCard
                href={`/materias/${subject.id}`}
                name={subject.name}
                color={subject.color}
                icon={subjectIcon(subject.icon)}
                schedule={formatSchedule(subject.schedule_slots) || undefined}
                nextAssessment={next ? assessmentPill(next, today!) : "Sem provas marcadas"}
                exam={next !== undefined && isExam(next)}
                progress={progress}
                counts={{ notes: 0, summaries: 0, files: 0 }}
              />
            </li>
          ))}
        </ul>
      )}

      <SubjectFormSheet
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(s) => router.push(`/materias/${s.id}`)}
      />
      <ImportSyllabusSheet
        open={importing}
        onClose={() => setImporting(false)}
        subjects={active.map((s) => s.subject)}
      />
    </>
  );
}
