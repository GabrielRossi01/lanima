"use client";

import { Check, X } from "lucide-react";
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { DifficultyBadge, TypeBadge, type Difficulty } from "./difficulty-badge";

export interface Alternative {
  id: string;
  text: string;
}

interface QuestionCardProps {
  difficulty: Difficulty;
  typeLabel: string;
  topic?: string;
  statement: string;
  alternatives: readonly Alternative[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** When set, the card is graded: the correct option turns green, a wrong pick turns red. */
  correctId?: string | null;
  /** Feedback block (explanation + SourceTag), shown under the options. */
  feedback?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

const LETTERS = "ABCDEFGH";

export function QuestionCard({
  difficulty,
  typeLabel,
  topic,
  statement,
  alternatives,
  selectedId,
  onSelect,
  correctId,
  feedback,
  footer,
  className,
}: QuestionCardProps) {
  const graded = correctId != null;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const focusIndex = Math.max(
    0,
    alternatives.findIndex((a) => a.id === selectedId),
  );

  function onKeyDown(event: KeyboardEvent, index: number) {
    if (graded) return;
    const delta =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? -1
          : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + alternatives.length) % alternatives.length;
    onSelect(alternatives[next].id);
    refs.current[next]?.focus();
  }

  return (
    <article
      className={cn(
        "flex min-w-0 flex-col gap-[18px] rounded-xl border border-line bg-surface p-5 shadow-card md:p-7",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <DifficultyBadge level={difficulty} />
        <TypeBadge>{typeLabel}</TypeBadge>
        {topic && <span className="text-xs text-fg-2">{topic}</span>}
      </div>
      <h2 className="m-0 font-serif text-xl leading-7 font-semibold tracking-[-0.3px] md:text-2xl md:leading-8">
        {statement}
      </h2>
      <div role="radiogroup" aria-label="Alternativas" className="flex flex-col gap-2.5">
        {alternatives.map((alt, index) => {
          const selected = alt.id === selectedId;
          const isRight = graded && alt.id === correctId;
          const isWrong = graded && selected && alt.id !== correctId;
          return (
            <button
              key={alt.id}
              ref={(el) => {
                refs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-disabled={graded || undefined}
              tabIndex={index === focusIndex ? 0 : -1}
              onClick={() => !graded && onSelect(alt.id)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={cn(
                "flex min-h-[60px] w-full items-center gap-3.5 rounded-lg px-4 py-3 text-left text-[15px] leading-[21px] text-fg transition-[border-color,background-color] duration-200",
                isRight
                  ? "border-2 border-success bg-surface"
                  : isWrong
                    ? "border-2 border-danger bg-active"
                    : selected
                      ? "border-2 border-brand bg-active"
                      : "border border-line bg-surface hover:border-line-strong",
              )}
            >
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-alt text-sm font-bold text-accent"
              >
                {LETTERS[index]}
              </span>
              <span className="flex-1">{alt.text}</span>
              {isRight && (
                <>
                  <Check aria-hidden size={20} strokeWidth={2} className="shrink-0 text-success" />
                  <span className="sr-only">(alternativa correta)</span>
                </>
              )}
              {isWrong && (
                <>
                  <X aria-hidden size={20} strokeWidth={2} className="shrink-0 text-danger" />
                  <span className="sr-only">(sua resposta, incorreta)</span>
                </>
              )}
            </button>
          );
        })}
      </div>
      {feedback && (
        <section aria-live="polite" className="flex flex-col gap-1.5 rounded-[18px] bg-surface-alt px-[18px] py-4">
          {feedback}
        </section>
      )}
      {footer && <div className="mt-auto flex flex-wrap items-center justify-between gap-3">{footer}</div>}
    </article>
  );
}
