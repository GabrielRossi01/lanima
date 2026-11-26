"use client";

import { BookOpen, CalendarClock, CircleCheck, FileText, ListTree, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { SearchField } from "@/components/ui/input";
import { useFiles } from "@/features/files/queries";
import { useGoals } from "@/features/goals/queries";
import { useAssessments, useSubjects, useTopics } from "@/features/subjects/queries";
import { cn } from "@/lib/cn";
import { formatDate, type IsoDate } from "@/lib/dates/calendar";
import { SEARCH_KIND_LABEL, searchItems, type SearchItem, type SearchKind } from "@/lib/search/search";

const KIND_ICON: Record<SearchKind, LucideIcon> = {
  materia: BookOpen,
  topico: ListTree,
  avaliacao: CalendarClock,
  meta: CircleCheck,
  arquivo: FileText,
};

/**
 * Search at the top of Início: subjects, syllabus topics, assessments, goals and files (accents and
 * case ignored). Notes, summaries and questions join in their phases.
 */
export function GlobalSearch({ today, className }: { today: IsoDate | null; className?: string }) {
  const [query, setQuery] = useState("");
  const subjects = useSubjects().data ?? [];
  const topics = useTopics().data ?? [];
  const assessments = useAssessments().data ?? [];
  const goals = useGoals(today).data ?? [];
  const files = useFiles().data ?? [];
  const resultsId = useId();

  const nameOf = new Map(subjects.map((s) => [s.id, s.name]));
  const items: SearchItem[] = [
    ...subjects.map((s) => ({
      kind: "materia" as const,
      id: s.id,
      title: s.name,
      detail: s.archived ? "arquivada" : (s.professor ?? ""),
      href: `/materias/${s.id}`,
    })),
    ...topics.map((t) => ({
      kind: "topico" as const,
      id: t.id,
      title: t.title,
      detail: nameOf.get(t.subject_id) ?? "",
      href: `/materias/${t.subject_id}`,
    })),
    ...assessments.map((a) => ({
      kind: "avaliacao" as const,
      id: a.id,
      title: a.title,
      detail: `${nameOf.get(a.subject_id) ?? ""} · ${formatDate(a.date)}${a.description ? ` · ${a.description}` : ""}`,
      href: `/materias/${a.subject_id}`,
    })),
    ...goals.map((g) => ({
      kind: "meta" as const,
      id: g.id,
      title: g.title,
      detail: `${g.subject_id ? `${nameOf.get(g.subject_id) ?? ""} · ` : ""}${formatDate(g.date)}`,
      href: "/inicio",
    })),
    ...files.map((f) => ({
      kind: "arquivo" as const,
      id: f.id,
      title: f.name,
      detail: f.subject_id ? (nameOf.get(f.subject_id) ?? "") : "Sem matéria",
      href: `/arquivos#arquivo-${f.id}`,
    })),
  ];
  const results = searchItems(items, query);
  const open = query.trim().length > 0;
  const kinds = [...new Set(results.map((r) => r.kind))];

  return (
    <div className={cn("relative", className)} onKeyDown={(e) => e.key === "Escape" && setQuery("")}>
      <SearchField
        value={query}
        onValueChange={setQuery}
        placeholder="Buscar matérias, provas…"
        aria-controls={open ? resultsId : undefined}
        aria-expanded={open}
        className="w-full"
      />
      {open && (
        <div
          id={resultsId}
          role="region"
          aria-label="Resultados da busca"
          aria-live="polite"
          className="absolute inset-x-0 top-12 z-30 max-h-[60dvh] overflow-y-auto rounded-lg border border-line bg-surface p-2 shadow-float md:left-auto md:w-[min(420px,90vw)]"
        >
          {results.length === 0 ? (
            <p className="type-body m-0 px-2 py-3 text-fg-2">Nada encontrado para “{query.trim()}”.</p>
          ) : (
            kinds.map((kind) => (
              <section key={kind} aria-label={SEARCH_KIND_LABEL[kind]} className="py-1">
                <h3 className="type-overline m-0 px-2 py-1 text-fg-2">{SEARCH_KIND_LABEL[kind]}</h3>
                <ul className="m-0 list-none p-0">
                  {results
                    .filter((r) => r.kind === kind)
                    .map((r) => {
                      const Icon = KIND_ICON[r.kind];
                      return (
                        <li key={`${r.kind}-${r.id}`}>
                          <Link
                            href={r.href}
                            onClick={() => setQuery("")}
                            className="flex min-h-11 items-center gap-3 rounded-md px-2 py-1.5 text-fg no-underline hover:bg-surface-alt"
                          >
                            <Icon aria-hidden size={18} strokeWidth={1.75} className="shrink-0 text-accent" />
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate text-sm font-semibold">{r.title}</span>
                              {r.detail && <span className="truncate text-xs text-fg-2">{r.detail}</span>}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                </ul>
              </section>
            ))
          )}
        </div>
      )}
    </div>
  );
}
