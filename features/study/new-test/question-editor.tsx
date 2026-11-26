"use client";

import { Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Field, Label, SelectField } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPES,
  type QuestionType,
} from "@/lib/ai/schemas";
import { cn } from "@/lib/cn";
import { emptyForm, fromForm, toForm, type FormErrors, type QuestionForm } from "@/lib/study/question-form";
import { friendlyError } from "@/lib/supabase/errors";
import { insertManual, updateQuestion, type Question } from "../test-queries";

function TextArea({
  label,
  value,
  onChange,
  error,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  rows?: number;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-erro` : undefined}
        className="w-full rounded-md border border-line-strong bg-surface p-3 text-sm text-fg aria-invalid:border-danger"
      />
      {error && (
        <p id={`${id}-erro`} className="type-caption m-0 text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Edit a question of the proposal, or write one by hand (section 7.5, step 3): statement, options,
 * the right answer and the explanation. Saved in her bank right away.
 */
export function QuestionEditor({
  question,
  topic,
  subjectId,
  onClose,
  onSaved,
}: {
  /** null: a new question she writes. */
  question: Question | null;
  topic: string;
  subjectId: string | null;
  onClose: () => void;
  onSaved: (question: Question) => void;
}) {
  const [form, setForm] = useState<QuestionForm>(() =>
    question ? toForm(question) : emptyForm("multipla_escolha", topic),
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<QuestionForm>) => setForm((f) => ({ ...f, ...patch }));
  const errorId = useId();

  async function save() {
    const result = fromForm(form);
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    setSaving(true);
    try {
      const saved = question
        ? await updateQuestion(question.id, result.value)
        : await insertManual(result.value, subjectId);
      onSaved(saved);
    } catch (error) {
      toast({ title: "Não foi possível salvar a questão", description: friendlyError(error), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  const choice = form.type === "multipla_escolha" || form.type === "caso_clinico";
  return (
    <Sheet
      open
      onClose={saving ? () => {} : onClose}
      title={question ? "Editar questão" : "Escrever questão"}
      size="l"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Salvando…" : "Salvar questão"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <SelectField
            label="Tipo"
            value={form.type}
            disabled={question !== null}
            onChange={(e) =>
              set({
                ...emptyForm(e.target.value as QuestionType, form.topic),
                difficulty: form.difficulty,
                statement: form.statement,
                explanation: form.explanation,
              })
            }
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {QUESTION_TYPE_LABELS[t]}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Nível"
            value={form.difficulty}
            onChange={(e) => set({ difficulty: e.target.value as QuestionForm["difficulty"] })}
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {DIFFICULTY_LABELS[d]}
              </option>
            ))}
          </SelectField>
          <Field
            label="Tópico"
            value={form.topic}
            maxLength={120}
            error={errors.topic}
            onChange={(e) => set({ topic: e.target.value })}
          />
        </div>
        <TextArea
          label="Enunciado"
          value={form.statement}
          error={errors.statement}
          onChange={(statement) => set({ statement })}
          rows={4}
        />

        {choice && (
          <fieldset
            className="m-0 flex flex-col gap-2 border-0 p-0"
            aria-describedby={errors.options || errors.answer ? errorId : undefined}
          >
            <legend className="mb-1 p-0 text-[13px] font-semibold">Alternativas (marque a correta)</legend>
            {form.options.map((option, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correta"
                  aria-label={`Alternativa ${i + 1} é a correta`}
                  checked={form.correct === i}
                  onChange={() => set({ correct: i })}
                  className="size-5 shrink-0 accent-[var(--btn)]"
                />
                <input
                  aria-label={`Alternativa ${i + 1}`}
                  value={option}
                  maxLength={600}
                  onChange={(e) => set({ options: form.options.map((o, j) => (j === i ? e.target.value : o)) })}
                  className="h-11 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-3 text-sm text-fg"
                />
                <IconButton
                  icon={Trash2}
                  label={`Tirar a alternativa ${i + 1}`}
                  size="s"
                  variant="ghost"
                  disabled={form.options.length <= 2}
                  onClick={() =>
                    set({
                      options: form.options.filter((_, j) => j !== i),
                      correct:
                        form.correct === i
                          ? null
                          : form.correct !== null && form.correct > i
                            ? form.correct - 1
                            : form.correct,
                    })
                  }
                />
              </div>
            ))}
            {form.options.length < 5 && (
              <Button
                variant="ghost"
                size="s"
                icon={Plus}
                className="self-start"
                onClick={() => set({ options: [...form.options, ""] })}
              >
                Alternativa
              </Button>
            )}
          </fieldset>
        )}

        {form.type === "verdadeiro_falso" && (
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 p-0 text-[13px] font-semibold">A afirmação é</legend>
            <div className="flex gap-2">
              {([true, false] as const).map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  aria-pressed={form.value === v}
                  onClick={() => set({ value: v })}
                  className={cn(
                    "h-11 flex-1 rounded-full border text-sm font-semibold",
                    form.value === v ? "border-btn bg-btn text-white" : "border-line-strong bg-surface text-fg",
                  )}
                >
                  {v ? "Verdadeira" : "Falsa"}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {form.type === "associacao" && (
          <fieldset
            className="m-0 flex flex-col gap-2 border-0 p-0"
            aria-describedby={errors.pairs ? errorId : undefined}
          >
            <legend className="mb-1 p-0 text-[13px] font-semibold">
              Pares (na associação certa; o teste embaralha)
            </legend>
            {form.pairs.map((pair, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  aria-label={`Item ${i + 1}`}
                  value={pair.left}
                  onChange={(e) =>
                    set({ pairs: form.pairs.map((p, j) => (j === i ? { ...p, left: e.target.value } : p)) })
                  }
                  className="h-11 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-3 text-sm text-fg"
                />
                <span aria-hidden className="text-fg-2">
                  ↔
                </span>
                <input
                  aria-label={`Par do item ${i + 1}`}
                  value={pair.right}
                  onChange={(e) =>
                    set({ pairs: form.pairs.map((p, j) => (j === i ? { ...p, right: e.target.value } : p)) })
                  }
                  className="h-11 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-3 text-sm text-fg"
                />
                <IconButton
                  icon={Trash2}
                  label={`Tirar o par ${i + 1}`}
                  size="s"
                  variant="ghost"
                  disabled={form.pairs.length <= 2}
                  onClick={() => set({ pairs: form.pairs.filter((_, j) => j !== i) })}
                />
              </div>
            ))}
            {form.pairs.length < 6 && (
              <Button
                variant="ghost"
                size="s"
                icon={Plus}
                className="self-start"
                onClick={() => set({ pairs: [...form.pairs, { left: "", right: "" }] })}
              >
                Par
              </Button>
            )}
          </fieldset>
        )}

        {form.type === "resposta_curta" && (
          <TextArea
            label="Resposta esperada"
            value={form.expected}
            error={errors.expected}
            onChange={(expected) => set({ expected })}
            rows={2}
          />
        )}

        {(errors.options || errors.answer || errors.pairs) && (
          <p id={errorId} role="alert" className="type-caption m-0 text-danger-text">
            {errors.options ?? errors.answer ?? errors.pairs}
          </p>
        )}

        <TextArea
          label="Explicação (de 1 a 3 frases)"
          value={form.explanation}
          error={errors.explanation}
          onChange={(explanation) => set({ explanation })}
          rows={2}
        />
      </div>
    </Sheet>
  );
}
