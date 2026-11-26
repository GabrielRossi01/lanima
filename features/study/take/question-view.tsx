"use client";

import { Check, FileText, X } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { QuestionCard } from "@/components/ui/question-card";
import { QUESTION_TYPE_LABELS } from "@/lib/ai/schemas";
import { cn } from "@/lib/cn";
import { isCorrect, type Response, type SelfAssessment } from "@/lib/study/grading";
import type { LocalAnswer } from "../attempts";
import type { Question } from "../test-queries";

const LETTERS = "ABCDEFGH";

export const SELF_LABELS: Record<SelfAssessment, string> = { acertei: "Acertei", parcial: "Parcial", errei: "Errei" };

/** "Acertei / Parcial / Errei" after a short answer (section 7.5: no AI, works offline). */
export function SelfAssessmentButtons({
  value,
  onChange,
  label,
}: {
  value: SelfAssessment | null;
  onChange: (value: SelfAssessment) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {(["acertei", "parcial", "errei"] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "h-11 rounded-full border px-5 text-sm font-semibold",
            value === v ? "border-btn bg-btn text-white" : "border-line-strong bg-surface text-fg",
          )}
        >
          {SELF_LABELS[v]}
        </button>
      ))}
    </div>
  );
}

/** Right, wrong, the explanation and the source (treino, after confirming; and the review). */
export function Feedback({
  question,
  answer,
  order,
  fileName,
}: {
  question: Question;
  answer: LocalAnswer | undefined;
  order: number[];
  fileName: (documentId: string) => string | null;
}) {
  const right = isCorrect(question, answer);
  const key = (question.answer ?? {}) as Record<string, unknown>;
  let correctText = "";
  if (question.type === "multipla_escolha" || question.type === "caso_clinico") {
    correctText = `A correta é a ${LETTERS[order.indexOf(key.index as number)]}.`;
  } else if (question.type === "verdadeiro_falso") {
    correctText = `A afirmação é ${key.value ? "verdadeira" : "falsa"}.`;
  }
  const source = question.source;
  return (
    <>
      {question.type === "resposta_curta" ? (
        <span className="text-[15px] font-bold">Resposta esperada</span>
      ) : right ? (
        <span className="flex items-center gap-2 text-[15px] font-bold text-success-text">
          <Check aria-hidden size={18} strokeWidth={2.5} />
          Correta!
        </span>
      ) : (
        <span className="flex items-center gap-2 text-[15px] font-bold text-danger-text">
          <X aria-hidden size={18} strokeWidth={2.5} />
          {answer?.response ? "Não foi dessa vez." : "Em branco."} {correctText}
        </span>
      )}
      {question.type === "resposta_curta" && <p className="m-0 text-sm leading-[21px]">{String(key.text ?? "")}</p>}
      {question.explanation && <p className="m-0 text-sm leading-[21px]">{question.explanation}</p>}
      {source && (
        <span className="inline-flex h-6 max-w-full items-center gap-1 self-start rounded-sm bg-surface px-2 text-xs font-medium text-accent">
          <FileText aria-hidden size={13} strokeWidth={1.75} className="shrink-0" />
          <span className="truncate">
            {fileName(source.documentId) ?? "Arquivo excluído"} · p. {source.page}
          </span>
        </span>
      )}
    </>
  );
}

/** Matching (section 7.5: "tocar em pares"): tap an item, then what goes with it. */
function Matching({
  question,
  match,
  graded,
  onChange,
}: {
  question: Question;
  match: number[];
  graded: boolean;
  onChange: (match: number[]) => void;
}) {
  const { left = [], right = [] } = (question.options ?? {}) as { left?: string[]; right?: string[] };
  const correct = ((question.answer ?? {}) as { match?: number[] }).match ?? [];
  const [picked, setPicked] = useState<number | null>(null);
  const hint = useId();

  function pair(r: number) {
    if (picked === null || graded) return;
    const next = match.map((m) => (m === r ? -1 : m));
    next[picked] = r;
    onChange(next);
    setPicked(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <p id={hint} className="m-0 text-[13px] text-fg-2">
        {graded ? "Pares certos em verde." : "Toque num item e depois no que combina com ele."}
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ol className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Itens">
          {left.map((item, i) => {
            const paired = match[i] >= 0 ? right[match[i]] : null;
            const ok = graded && match[i] === correct[i];
            return (
              <li key={i}>
                <button
                  type="button"
                  aria-pressed={picked === i}
                  aria-describedby={hint}
                  disabled={graded}
                  onClick={() => setPicked(picked === i ? null : i)}
                  className={cn(
                    "flex min-h-14 w-full flex-col items-start gap-1 rounded-lg px-4 py-2.5 text-left text-[15px] text-fg",
                    picked === i ? "border-2 border-brand bg-active" : "border border-line bg-surface",
                    graded && (ok ? "border-2 border-success" : "border-2 border-danger"),
                  )}
                >
                  <span>
                    <span className="mr-1 font-bold text-accent">{i + 1}.</span> {item}
                  </span>
                  {paired && <span className="text-[13px] font-semibold text-accent">↔ {paired}</span>}
                  {graded && !ok && (
                    <span className="text-[13px] font-semibold text-success-text">Certo: {right[correct[i]]}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Opções para ligar">
          {right.map((item, r) => {
            const owner = match.indexOf(r);
            return (
              <li key={r}>
                <button
                  type="button"
                  disabled={graded || picked === null}
                  onClick={() => pair(r)}
                  aria-label={`Ligar a: ${item}`}
                  className={cn(
                    "flex min-h-14 w-full items-center gap-3 rounded-lg border px-4 py-2.5 text-left text-[15px] text-fg disabled:cursor-default",
                    owner >= 0 ? "border-brand bg-surface-alt" : "border-line bg-surface",
                  )}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-alt text-xs font-bold text-accent">
                    {owner >= 0 ? owner + 1 : "–"}
                  </span>
                  {item}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/**
 * One question of the test, any type, in the card of the mockup (Questao.html). `graded` shows the
 * correction (treino after confirming).
 */
export function QuestionView({
  question,
  answer,
  order,
  graded,
  onResponse,
  feedback,
  footer,
}: {
  question: Question;
  answer: LocalAnswer | undefined;
  order: number[];
  graded: boolean;
  onResponse: (response: Response) => void;
  feedback: ReactNode;
  footer: ReactNode;
}) {
  const common = {
    difficulty: question.difficulty,
    typeLabel: QUESTION_TYPE_LABELS[question.type],
    topic: question.topic,
    statement: question.statement,
    feedback,
    footer,
    className: "flex-1",
  };
  const response = answer?.response as Record<string, unknown> | null | undefined;
  const key = (question.answer ?? {}) as Record<string, unknown>;

  if (question.type === "multipla_escolha" || question.type === "caso_clinico") {
    const options = (question.options as string[]) ?? [];
    return (
      <QuestionCard
        {...common}
        alternatives={order.map((i) => ({ id: String(i), text: options[i] }))}
        selectedId={typeof response?.index === "number" ? String(response.index) : null}
        onSelect={(id) => onResponse({ index: Number(id) })}
        correctId={graded ? String(key.index) : null}
      />
    );
  }
  if (question.type === "verdadeiro_falso") {
    return (
      <QuestionCard
        {...common}
        alternatives={[
          { id: "true", text: "Verdadeiro" },
          { id: "false", text: "Falso" },
        ]}
        selectedId={typeof response?.value === "boolean" ? String(response.value) : null}
        onSelect={(id) => onResponse({ value: id === "true" })}
        correctId={graded ? String(key.value) : null}
      />
    );
  }
  if (question.type === "associacao") {
    const left = ((question.options ?? {}) as { left?: string[] }).left ?? [];
    const match = (response?.match as number[] | undefined) ?? left.map(() => -1);
    return (
      <QuestionCard
        {...common}
        alternatives={[]}
        selectedId={null}
        onSelect={() => {}}
        body={<Matching question={question} match={match} graded={graded} onChange={(m) => onResponse({ match: m })} />}
      />
    );
  }
  return (
    <QuestionCard
      {...common}
      alternatives={[]}
      selectedId={null}
      onSelect={() => {}}
      body={
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold">Sua resposta</span>
          <textarea
            value={String(response?.text ?? "")}
            disabled={graded}
            rows={4}
            maxLength={2000}
            onChange={(e) => onResponse({ text: e.target.value })}
            className="w-full rounded-lg border border-line-strong bg-surface p-3 text-[15px] text-fg disabled:opacity-80"
          />
        </label>
      }
    />
  );
}
