"use client";

import { Trash2 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Field, SelectField } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { TimeField } from "@/components/ui/time-field";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { IsoDate } from "@/lib/dates/calendar";
import { durationOptions, formatDuration, goalFormSchema, type GoalForm, type GoalRow } from "@/lib/goals/goals";
import { fieldErrors, type Subject } from "@/lib/subjects/subjects";
import { friendlyError } from "@/lib/supabase/errors";
import { useDeleteGoal, useSaveGoal } from "./queries";

interface GoalFormSheetProps {
  open: boolean;
  onClose: () => void;
  today: IsoDate;
  subjects: readonly Subject[];
  goal?: GoalRow;
}

type When = "duracao" | "horario";

function initial(today: IsoDate, goal?: GoalRow): GoalForm {
  return goal
    ? {
        title: goal.title,
        subject_id: goal.subject_id,
        date: goal.date,
        duration_min: goal.duration_min,
        time_of_day: goal.time_of_day ? goal.time_of_day.slice(0, 5) : null,
      }
    : { title: "", subject_id: null, date: today, duration_min: 30, time_of_day: null };
}

/** New or edit goal: what, subject (optional), day, and either a duration or a fixed time. */
export function GoalFormSheet({ open, onClose, today, subjects, goal }: GoalFormSheetProps) {
  const save = useSaveGoal();
  const remove = useDeleteGoal();
  const [form, setForm] = useState<GoalForm>(() => initial(today, goal));
  const [when, setWhen] = useState<When>(goal?.time_of_day ? "horario" : "duracao");
  const [errors, setErrors] = useState<Partial<Record<keyof GoalForm, string>>>({});
  const [lastKey, setLastKey] = useState("");
  const key = `${open}-${goal?.id}`;
  if (key !== lastKey) {
    setLastKey(key);
    if (open) {
      setForm(initial(today, goal));
      setWhen(goal?.time_of_day ? "horario" : "duracao");
      setErrors({});
    }
  }
  const set = <K extends keyof GoalForm>(k: K, v: GoalForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const formId = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const candidate: GoalForm =
      when === "horario"
        ? { ...form, duration_min: null, time_of_day: form.time_of_day ?? "" }
        : { ...form, time_of_day: null };
    const parsed = goalFormSchema.safeParse(candidate);
    if (!parsed.success) {
      setErrors(fieldErrors<keyof GoalForm>(parsed.error.issues));
      return;
    }
    try {
      await save.mutateAsync({ id: goal?.id, form: parsed.data });
      toast({ title: goal ? "Meta atualizada" : "Meta criada", tone: "success" });
      onClose();
    } catch (error) {
      toast({ title: "Não foi possível salvar", description: friendlyError(error), tone: "danger" });
    }
  }

  const activeSubjects = subjects.filter((s) => !s.archived || s.id === form.subject_id);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={goal ? "Editar meta" : "Nova meta"}
      size="s"
      footer={
        <>
          {goal && (
            <Button
              variant="ghost"
              icon={Trash2}
              className="mr-auto text-danger-text"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(goal.id, {
                  onSuccess: () => {
                    toast({ title: "Meta excluída", description: goal.title });
                    onClose();
                  },
                  onError: (error) =>
                    toast({ title: "Não foi possível excluir", description: friendlyError(error), tone: "danger" }),
                })
              }
            >
              Excluir
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field
          label="Meta"
          placeholder="Revisar sistema esquelético"
          value={form.title}
          maxLength={120}
          onChange={(e) => set("title", e.target.value)}
          error={errors.title}
          autoFocus={!goal}
        />
        <SelectField
          label="Matéria (opcional)"
          value={form.subject_id ?? ""}
          onChange={(e) => set("subject_id", e.target.value || null)}
        >
          <option value="">Sem matéria</option>
          {activeSubjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
        <DateField
          label="Dia"
          value={form.date}
          onValueChange={(date) => set("date", date)}
          today={today}
          error={errors.date}
        />

        <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
          <legend className="mb-2 p-0 text-[13px] font-semibold">Quanto tempo</legend>
          <div
            className="flex gap-1 self-start rounded-full bg-subtle p-1"
            role="radiogroup"
            aria-label="Tipo de tempo"
          >
            {(
              [
                ["duracao", "Duração"],
                ["horario", "Horário marcado"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={when === value}
                onClick={() => setWhen(value)}
                className={cn(
                  "min-h-10 rounded-full px-4 text-sm font-semibold transition-colors duration-150",
                  when === value ? "bg-surface text-fg shadow-card" : "text-fg-2",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {when === "duracao" ? (
            <div className="flex flex-wrap items-center gap-2">
              {durationOptions(goal?.duration_min).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={form.duration_min === m}
                  onClick={() => set("duration_min", m)}
                  className={cn(
                    "inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors duration-150",
                    form.duration_min === m ? "border-fg bg-fg text-bg" : "border-line-strong bg-surface text-fg",
                  )}
                >
                  {formatDuration(m)}
                </button>
              ))}
            </div>
          ) : (
            <TimeField
              label="Horário"
              value={form.time_of_day ?? ""}
              onValueChange={(time) => set("time_of_day", time || null)}
              error={errors.time_of_day}
              className="w-36"
            />
          )}
        </fieldset>
      </form>
    </Sheet>
  );
}
