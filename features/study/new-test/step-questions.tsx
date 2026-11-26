"use client";

import {
  AlertTriangle,
  Check,
  ChevronDown,
  FileText,
  Flag,
  ListChecks,
  Pencil,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DifficultyBadge, TypeBadge } from "@/components/ui/difficulty-badge";
import { IconButton } from "@/components/ui/icon-button";
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  QUESTION_TYPE_LABELS,
  type Difficulty,
  type QuestionType,
} from "@/lib/ai/schemas";
import { cn } from "@/lib/cn";
import { topicKey } from "@/lib/study/test-config";
import type { Question } from "../test-queries";

type Filter =
  | { kind: "todas" }
  | { kind: "nivel"; value: Difficulty }
  | { kind: "tipo"; value: QuestionType }
  | { kind: "topico"; value: string };

function FilterButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "h-9 rounded-full border px-3.5 text-[13px] font-medium tabular-nums",
        on ? "border-fg bg-fg text-bg" : "border-line-strong bg-surface text-fg",
      )}
    >
      {children}
    </button>
  );
}

/** The right answer, in words: shown when she opens "Ver resposta". */
function AnswerPreview({ q }: { q: Question }) {
  const answer = (q.answer ?? {}) as Record<string, unknown>;
  if (q.type === "multipla_escolha" || q.type === "caso_clinico") {
    const options = (q.options as string[]) ?? [];
    return (
      <ol className="m-0 flex list-[upper-alpha] flex-col gap-1 pl-5 text-sm">
        {options.map((o, i) => (
          <li key={i} className={cn(i === answer.index && "font-semibold text-success-text")}>
            {o}
            {i === answer.index && " (correta)"}
          </li>
        ))}
      </ol>
    );
  }
  if (q.type === "verdadeiro_falso")
    return <p className="m-0 text-sm font-semibold">{answer.value ? "Verdadeira" : "Falsa"}</p>;
  if (q.type === "associacao") {
    const { left = [], right = [] } = (q.options ?? {}) as { left?: string[]; right?: string[] };
    const match = (answer.match as number[]) ?? [];
    return (
      <ul className="m-0 flex flex-col gap-1 pl-5 text-sm">
        {left.map((l, i) => (
          <li key={i}>
            {l} ↔ {right[match[i]]}
          </li>
        ))}
      </ul>
    );
  }
  return <p className="m-0 text-sm">{String(answer.text ?? "")}</p>;
}

/** Step 3 (TesteSelecao.html): she picks which questions go in, edits, swaps, flags or writes more. */
export function StepQuestions({
  proposal,
  selected,
  target,
  fromBank,
  flagged,
  fileName,
  busy,
  status,
  title,
  onTitle,
  onToggle,
  onEdit,
  onWrite,
  onSwap,
  onFlag,
  onMore,
  onSave,
  saving,
}: {
  proposal: Question[];
  selected: ReadonlySet<string>;
  target: number;
  fromBank: ReadonlySet<string>;
  flagged: ReadonlySet<string>;
  fileName: (documentId: string) => string | null;
  busy: boolean;
  status: ReactNode;
  title: string;
  onTitle: (title: string) => void;
  onToggle: (id: string) => void;
  onEdit: (q: Question) => void;
  onWrite: () => void;
  onSwap: (q: Question) => void;
  onFlag: (q: Question) => void;
  onMore: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [filter, setFilter] = useState<Filter>({ kind: "todas" });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const types = [...new Set(proposal.map((q) => q.type))];
  const topics = [...new Map(proposal.map((q) => [topicKey(q.topic), q.topic])).values()];
  const visible = proposal.filter((q) =>
    filter.kind === "todas"
      ? true
      : filter.kind === "nivel"
        ? q.difficulty === filter.value
        : filter.kind === "tipo"
          ? q.type === filter.value
          : topicKey(q.topic) === topicKey(filter.value),
  );
  const count = proposal.filter((q) => selected.has(q.id)).length;
  const pct = Math.min(100, Math.round((count / Math.max(target, 1)) * 100));
  const same = (f: Filter) => JSON.stringify(f) === JSON.stringify(filter);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar questões">
        <FilterButton on={same({ kind: "todas" })} onClick={() => setFilter({ kind: "todas" })}>
          Todas {proposal.length}
        </FilterButton>
        {DIFFICULTIES.filter((d) => proposal.some((q) => q.difficulty === d)).map((d) => (
          <FilterButton
            key={d}
            on={same({ kind: "nivel", value: d })}
            onClick={() => setFilter({ kind: "nivel", value: d })}
          >
            {DIFFICULTY_LABELS[d]} {proposal.filter((q) => q.difficulty === d).length}
          </FilterButton>
        ))}
        {types.length > 1 && <span aria-hidden className="h-6 w-px bg-line" />}
        {types.length > 1 &&
          types.map((t) => (
            <FilterButton
              key={t}
              on={same({ kind: "tipo", value: t })}
              onClick={() => setFilter({ kind: "tipo", value: t })}
            >
              {QUESTION_TYPE_LABELS[t]}
            </FilterButton>
          ))}
        {topics.length > 1 && <span aria-hidden className="h-6 w-px bg-line" />}
        {topics.length > 1 &&
          topics.map((t) => (
            <FilterButton
              key={t}
              on={same({ kind: "topico", value: t })}
              onClick={() => setFilter({ kind: "topico", value: t })}
            >
              {t}
            </FilterButton>
          ))}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onWrite}
          className="h-9 rounded-full border border-dashed border-line-strong bg-transparent px-3.5 text-[13px] font-semibold text-accent"
        >
          + Escrever questão
        </button>
      </div>

      {status}

      <ol className="m-0 flex list-none flex-col gap-2.5 p-0" aria-label="Questões sugeridas">
        {visible.map((q) => {
          const n = proposal.indexOf(q) + 1;
          const on = selected.has(q.id);
          const isFlagged = flagged.has(q.id);
          const source = q.source && fileName(q.source.documentId);
          const expanded = open.has(q.id);
          return (
            <li
              key={q.id}
              className={cn(
                // Phones: checkbox and question, then the actions under the question. Wider: actions on the side.
                "grid grid-cols-[28px_minmax(0,1fr)] items-start gap-x-3.5 gap-y-1 rounded-[18px] px-4 py-3.5 md:grid-cols-[28px_minmax(0,1fr)_auto]",
                isFlagged
                  ? "border border-dashed border-line-strong bg-subtle opacity-70"
                  : on
                    ? "border-[1.5px] border-brand bg-surface"
                    : "border border-line bg-surface",
              )}
            >
              <button
                type="button"
                aria-pressed={on}
                aria-label={`Incluir questão ${n}`}
                disabled={isFlagged}
                onClick={() => onToggle(q.id)}
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-lg border-[1.5px]",
                  on ? "border-btn bg-btn text-white" : "border-checkbox bg-surface",
                )}
              >
                {on && <Check aria-hidden size={16} strokeWidth={2.5} />}
              </button>
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <DifficultyBadge level={q.difficulty} />
                  <TypeBadge>{QUESTION_TYPE_LABELS[q.type]}</TypeBadge>
                  <span className="text-xs text-fg-2">{q.topic}</span>
                  {fromBank.has(q.id) && (
                    <span className="inline-flex h-6 items-center rounded-full bg-hl-green px-2.5 text-xs font-semibold text-ink">
                      Do seu banco
                    </span>
                  )}
                  {q.origin === "manual" && (
                    <span className="inline-flex h-6 items-center rounded-full bg-subtle px-2.5 text-xs font-medium text-fg-2">
                      Escrita por você
                    </span>
                  )}
                  {isFlagged && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning-text">
                      <AlertTriangle aria-hidden size={13} strokeWidth={2} />
                      Sinalizada como confusa
                    </span>
                  )}
                </div>
                <span className="text-[15px] leading-[22px] whitespace-pre-line">{q.statement}</span>
                <div className="flex flex-wrap items-center gap-2">
                  {q.source && (
                    <span className="inline-flex h-6 max-w-full items-center gap-1 rounded-sm bg-surface-alt px-2 text-xs font-medium text-accent">
                      <FileText aria-hidden size={13} strokeWidth={1.75} className="shrink-0" />
                      <span className="truncate">
                        {source ?? "Arquivo excluído"} · p. {q.source.page}
                      </span>
                    </span>
                  )}
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() =>
                      setOpen((set) => {
                        const next = new Set(set);
                        if (next.has(q.id)) next.delete(q.id);
                        else next.add(q.id);
                        return next;
                      })
                    }
                    className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-accent"
                  >
                    Ver resposta
                    <ChevronDown aria-hidden size={14} className={cn(expanded && "rotate-180")} />
                  </button>
                </div>
                {expanded && (
                  <div className="flex flex-col gap-2 rounded-md bg-surface-alt p-3">
                    <AnswerPreview q={q} />
                    {q.explanation && <p className="m-0 text-[13px] text-fg-2">{q.explanation}</p>}
                  </div>
                )}
              </div>
              <div className="col-start-2 flex gap-0.5 max-md:justify-end md:col-start-auto">
                <IconButton
                  icon={Pencil}
                  label={`Editar questão ${n}`}
                  size="s"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => onEdit(q)}
                />
                {q.origin === "ia" && !fromBank.has(q.id) && (
                  <IconButton
                    icon={RefreshCw}
                    label={`Gerar outra parecida com a questão ${n}`}
                    size="s"
                    variant="ghost"
                    disabled={busy || isFlagged}
                    onClick={() => onSwap(q)}
                  />
                )}
                <IconButton
                  icon={Flag}
                  label={
                    isFlagged ? `Tirar o sinal da questão ${n}` : `Sinalizar a questão ${n} como errada ou confusa`
                  }
                  size="s"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => onFlag(q)}
                />
              </div>
            </li>
          );
        })}
      </ol>

      {/* Stays at the bottom on tablets; on phones it would cover a third of the screen, so it ends the list. */}
      <div className="z-10 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card border border-line bg-surface px-[18px] py-3.5 shadow-float md:sticky md:bottom-[calc(env(safe-area-inset-bottom)+8px)]">
        <span className="flex w-[230px] max-w-full flex-col gap-1.5">
          <span className="text-sm font-semibold">
            <span aria-live="polite">{count}</span> de {target} selecionadas ·{" "}
            <span className="font-medium text-fg-2">
              {count >= target ? `Pronto: ${count} de ${target}` : `Faltam ${target - count}`}
            </span>
          </span>
          <span className="flex h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden>
            <span className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </span>
        </span>
        <label className="flex min-w-[160px] flex-1 flex-col gap-1">
          <span className="text-xs font-semibold text-fg-2">Nome do teste</span>
          <input
            value={title}
            maxLength={200}
            onChange={(e) => onTitle(e.target.value)}
            className="h-10 rounded-md border border-line-strong bg-surface px-3 text-sm text-fg"
          />
        </label>
        <span className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={Sparkles} disabled={busy} onClick={onMore}>
            Gerar mais 5
          </Button>
          <Button icon={ListChecks} disabled={busy || saving || count === 0 || !title.trim()} onClick={onSave}>
            {saving ? "Salvando…" : "Criar teste"}
          </Button>
        </span>
      </div>
    </div>
  );
}
