"use client";

import { Check, ChevronRight, FolderOpen, ListChecks } from "lucide-react";
import Link from "next/link";
import { Button, buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectField } from "@/components/ui/input";
import type { StoredFile } from "@/features/files/queries";
import { cn } from "@/lib/cn";
import { todayIn } from "@/lib/dates/calendar";
import { plural, shortDay } from "@/lib/study/format";
import type { Subject } from "@/lib/subjects/subjects";
import { DETAIL_LABELS } from "@/lib/ai/schemas";
import type { Summary } from "../queries";
import { SourcePicker } from "../source-picker";

export interface TopicGroups {
  fromSummaries: string[];
  fromSyllabus: string[];
}

function TopicChip({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium",
        on ? "border-transparent bg-hl-sky text-ink" : "border-line-strong bg-surface text-fg",
      )}
    >
      {on && <Check aria-hidden size={14} strokeWidth={2.5} />}
      {label}
    </button>
  );
}

/** Step 1 (the approved drawing): files, summaries and topics, with what was chosen on the side. */
export function StepContent(props: {
  subjects: Subject[];
  subjectId: string | null;
  onSubject: (id: string | null) => void;
  files: StoredFile[];
  selectedFiles: ReadonlySet<string>;
  onToggleFile: (id: string) => void;
  summaries: Summary[];
  selectedSummaries: ReadonlySet<string>;
  onToggleSummary: (id: string) => void;
  topics: TopicGroups;
  isTopicOn: (topic: string) => boolean;
  onToggleTopic: (topic: string) => void;
  onToggleAllTopics: () => void;
  bankCount: number;
  onNext: () => void;
  onCancel: () => void;
}) {
  const today = todayIn(new Date());
  const chosenFiles = props.files.filter((f) => props.selectedFiles.has(f.id) && f.document?.status === "pronto");
  const usable = props.files.filter((f) => f.document?.status === "pronto").length;
  const chosenSummaries = props.summaries.filter((s) => props.selectedSummaries.has(s.id));
  const sources = chosenFiles.length + chosenSummaries.length;
  const pages = chosenFiles.reduce((sum, f) => sum + (f.document?.page_count ?? 0), 0);
  const allTopics = [...props.topics.fromSummaries, ...props.topics.fromSyllabus];
  const onTopics = allTopics.filter(props.isTopicOn).length;
  const subjectName = props.subjects.find((s) => s.id === props.subjectId)?.name;

  if (props.files.length === 0 && props.summaries.length === 0) {
    return (
      <EmptyState
        icon={FolderOpen}
        title={subjectName ? `Nenhum arquivo de ${subjectName} ainda` : "Nenhum arquivo ainda"}
        description="O teste é feito a partir dos seus arquivos: slides, PDFs, Word ou fotos de páginas de livro. Envie o material da aula e volte aqui."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/arquivos" className={buttonClasses("primary", "m")}>
              Enviar arquivos
            </Link>
            {props.subjectId && (
              <Button variant="ghost" onClick={() => props.onSubject(null)}>
                Escolher outra matéria
              </Button>
            )}
          </div>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-[22px]">
        {props.subjects.length > 0 && (
          <SelectField
            label="Matéria do teste"
            value={props.subjectId ?? ""}
            onChange={(e) => props.onSubject(e.target.value || null)}
            className="max-w-sm"
          >
            <option value="">Todas as matérias</option>
            {props.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        )}

        <section className="flex flex-col gap-2.5" aria-labelledby="teste-arquivos">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="teste-arquivos" className="m-0 text-base font-semibold">
              Arquivos
            </h2>
            <span className="text-[13px] text-fg-2 tabular-nums">
              {chosenFiles.length} de {usable} {usable === 1 ? "marcado" : "marcados"}
            </span>
          </div>
          {props.files.length > 0 ? (
            <SourcePicker
              files={props.files}
              selected={props.selectedFiles}
              onToggle={props.onToggleFile}
              label="Arquivos do teste"
            />
          ) : (
            <p className="type-body m-0 text-fg-2">Nenhum arquivo {subjectName ? "desta matéria" : ""} ainda.</p>
          )}
          <p className="m-0 text-xs text-fg-2">
            {subjectName ? `Mostra os arquivos de ${subjectName}. ` : ""}Arquivos ainda sendo lidos ou sem texto legível
            não podem entrar.
          </p>
        </section>

        {props.summaries.length > 0 && (
          <section className="flex flex-col gap-2.5" aria-labelledby="teste-resumos">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="teste-resumos" className="m-0 text-base font-semibold">
                Resumos
              </h2>
              <span className="text-[13px] text-fg-2 tabular-nums">
                {chosenSummaries.length} de {props.summaries.length}{" "}
                {props.summaries.length === 1 ? "marcado" : "marcados"}
              </span>
            </div>
            <ul
              aria-label="Resumos do teste"
              className="m-0 list-none overflow-hidden rounded-card border border-line bg-surface p-0"
            >
              {props.summaries.map((s) => {
                const on = props.selectedSummaries.has(s.id);
                return (
                  <li key={s.id} className="border-t border-line first:border-t-0">
                    <label className="relative flex min-h-16 cursor-pointer items-center gap-3.5 px-3.5 py-2.5">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => props.onToggleSummary(s.id)}
                        className="peer absolute inset-0 size-full cursor-pointer appearance-none opacity-0"
                      />
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-[7px] border-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand",
                          on ? "border-btn bg-btn text-white" : "border-checkbox",
                        )}
                      >
                        {on && <Check size={14} strokeWidth={3} />}
                      </span>
                      <span
                        aria-hidden
                        className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-alt text-accent max-md:hidden"
                      >
                        <ListChecks size={20} strokeWidth={1.75} />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[15px] font-semibold">{s.title}</span>
                        <span className="text-xs text-fg-2">
                          Resumo {DETAIL_LABELS[s.detail].toLowerCase()} ·{" "}
                          {plural(s.content.topicos.length, "tópico", "tópicos")} ·{" "}
                          {plural(s.document_ids.length, "arquivo", "arquivos")} · {shortDay(s.created_at, today)}
                        </span>
                      </span>
                      {s.edited_by_user && (
                        <span className="inline-flex h-6 items-center rounded-full bg-hl-green px-2.5 text-xs font-semibold text-ink">
                          Editado
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-2.5" aria-labelledby="teste-topicos">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="teste-topicos" className="m-0 text-base font-semibold">
              Tópicos
            </h2>
            {allTopics.length > 0 && (
              <button
                type="button"
                onClick={props.onToggleAllTopics}
                className="min-h-8 px-0.5 text-[13px] font-semibold text-accent"
              >
                {onTopics === allTopics.length ? "Desmarcar todos" : "Marcar todos"}
              </button>
            )}
          </div>
          {props.topics.fromSummaries.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold tracking-[0.6px] text-fg-2 uppercase">Do resumo</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Tópicos do resumo">
                {props.topics.fromSummaries.map((t) => (
                  <TopicChip key={t} label={t} on={props.isTopicOn(t)} onToggle={() => props.onToggleTopic(t)} />
                ))}
              </div>
            </div>
          )}
          {props.topics.fromSyllabus.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold tracking-[0.6px] text-fg-2 uppercase">Do plano de ensino</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Tópicos do plano de ensino">
                {props.topics.fromSyllabus.map((t) => (
                  <TopicChip key={t} label={t} on={props.isTopicOn(t)} onToggle={() => props.onToggleTopic(t)} />
                ))}
              </div>
            </div>
          )}
          <p className="m-0 text-xs text-fg-2">
            {allTopics.length === 0
              ? "Sem resumo nem plano de ensino, as questões cobrem todo o conteúdo escolhido."
              : "As questões ficam só nos tópicos marcados. Com nenhum tópico marcado, valem todos os assuntos do conteúdo escolhido."}
          </p>
        </section>
      </div>

      <aside
        className="flex w-full shrink-0 flex-col gap-3.5 lg:sticky lg:top-4 lg:w-[290px]"
        aria-label="Resumo do conteúdo"
      >
        <section className="flex flex-col gap-2.5 rounded-card bg-deep p-5 text-white">
          <span className="text-[11px] font-semibold tracking-[1px] text-on-deep-2 uppercase">Seu conteúdo</span>
          <span className="font-serif text-[44px] leading-[48px] font-semibold tabular-nums">
            {plural(sources, "fonte", "fontes")}
          </span>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm text-on-deep-2 tabular-nums">
            <li>
              {plural(chosenFiles.length, "arquivo", "arquivos")} ·{" "}
              {plural(chosenSummaries.length, "resumo", "resumos")}
            </li>
            {pages > 0 && <li>{plural(pages, "página com texto", "páginas com texto")}</li>}
            <li>{onTopics === 0 ? "Todos os assuntos" : `${onTopics} de ${allTopics.length} tópicos`}</li>
          </ul>
        </section>
        <section className="flex flex-col gap-1.5 rounded-card border border-line bg-surface p-4 shadow-card">
          <strong className="text-[13px]">Do seu banco de questões</strong>
          <p className="m-0 text-[13px] leading-[18px] text-fg-2">
            {props.bankCount === 0
              ? "Nenhuma questão aprovada sobre estes tópicos ainda. Todas serão novas."
              : `${plural(props.bankCount, "questão aprovada", "questões aprovadas")} sobre estes tópicos ${props.bankCount === 1 ? "pode" : "podem"} entrar antes de gerar novas.`}
          </p>
        </section>
        <Button icon={ChevronRight} iconPosition="end" disabled={sources === 0} onClick={props.onNext}>
          Continuar
        </Button>
        {sources === 0 && <p className="m-0 text-center text-xs text-fg-2">Marque pelo menos um arquivo ou resumo.</p>}
        <Button variant="ghost" onClick={props.onCancel}>
          Cancelar
        </Button>
      </aside>
    </div>
  );
}
