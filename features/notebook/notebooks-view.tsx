"use client";

import { PenLine, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { useSubjects } from "@/features/subjects/queries";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/hooks/use-now";
import { SUBJECT_BG, type SubjectColor } from "@/lib/subjects/colors";
import { ContinueCard, NotebookGrid } from "./notebook-cards";
import { NotebookFormSheet } from "./notebook-form-sheet";
import { plural, useNotebookList, type NotebookWithPages } from "./queries";

const NO_SUBJECT = "sem-materia";

interface Group {
  key: string;
  name: string;
  color: SubjectColor | null;
  subjectId: string | null;
  notebooks: NotebookWithPages[];
}

/** Caderno (approved drawing): notebooks by subject, the last page to continue, filters. */
export function NotebooksView() {
  const list = useNotebookList();
  const subjects = useSubjects();
  const now = useNow();
  const [filter, setFilter] = useState<string>("todas");
  const [creating, setCreating] = useState(false);

  const subjectList = subjects.data ?? [];

  const groups: Group[] = [];
  if (list) {
    for (const subject of subjectList) {
      const own = list.filter((n) => n.subjectId === subject.id);
      if (own.length > 0)
        groups.push({
          key: subject.id,
          name: subject.name,
          color: subject.color,
          subjectId: subject.id,
          notebooks: own,
        });
    }
    const known = new Set(subjectList.map((s) => s.id));
    const loose = list.filter((n) => !n.subjectId || !known.has(n.subjectId));
    if (loose.length > 0)
      groups.push({ key: NO_SUBJECT, name: "Sem matéria", color: null, subjectId: null, notebooks: loose });
  }
  const shown = filter === "todas" ? groups : groups.filter((g) => g.key === filter);
  const latest = shown.flatMap((g) => g.notebooks).sort((a, b) => b.lastEditedAt - a.lastEditedAt)[0];
  const subjectName = (id: string | null) => subjectList.find((s) => s.id === id)?.name ?? null;

  const newButton = (
    <Button icon={Plus} onClick={() => setCreating(true)}>
      Novo caderno
    </Button>
  );

  return (
    <>
      <PageHeader title="Caderno" subtitle="Escreva à mão, por matéria. Funciona sem internet." actions={newButton} />

      {!list || !now ? (
        <div aria-busy className="flex flex-col gap-5">
          <div className="h-32 animate-pulse rounded-card bg-surface-alt motion-reduce:animate-none" />
          <div className="h-64 animate-pulse rounded-card bg-surface-alt motion-reduce:animate-none" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={PenLine}
          title="Nenhum caderno ainda"
          description="Crie um caderno por matéria ou por aula e escreva com a S Pen, o Apple Pencil ou o dedo. Funciona sem internet."
          action={newButton}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.length > 1 && (
            <div role="group" aria-label="Filtrar por matéria" className="flex flex-wrap gap-2">
              <FilterChip selected={filter === "todas"} count={list.length} onClick={() => setFilter("todas")}>
                Todas
              </FilterChip>
              {groups.map((g) => (
                <FilterChip
                  key={g.key}
                  selected={filter === g.key}
                  count={g.notebooks.length}
                  onClick={() => setFilter(filter === g.key ? "todas" : g.key)}
                >
                  {g.name}
                </FilterChip>
              ))}
            </div>
          )}

          {latest && <ContinueCard notebook={latest} subjectName={subjectName(latest.subjectId)} now={now.getTime()} />}

          {shown.map((g) => (
            <section key={g.key} aria-labelledby={`grupo-${g.key}`} className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className={cn("size-3 shrink-0 rounded-full", g.color ? SUBJECT_BG[g.color] : "bg-line-strong")}
                />
                <h2 id={`grupo-${g.key}`} className="m-0 text-[17px] font-semibold wrap-break-word">
                  {g.name}
                </h2>
                <span className="shrink-0 text-[13px] text-fg-2">
                  {plural(g.notebooks.length, "caderno", "cadernos")}
                </span>
                <span className="flex-1" />
                {g.subjectId && (
                  <Link
                    href={`/materias/${g.subjectId}`}
                    className="inline-flex min-h-11 shrink-0 items-center text-[13px] font-semibold text-accent"
                  >
                    Ver matéria
                  </Link>
                )}
              </div>
              <NotebookGrid notebooks={g.notebooks} now={now.getTime()} />
            </section>
          ))}
        </div>
      )}

      <NotebookFormSheet
        open={creating}
        onClose={() => setCreating(false)}
        subjectId={filter !== "todas" && filter !== NO_SUBJECT ? filter : null}
      />
    </>
  );
}
