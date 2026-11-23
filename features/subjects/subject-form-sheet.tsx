"use client";

import { Check, Plus, Trash2 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Field, Input, Label } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { WEEKDAY_LONG, WEEKDAY_SHORT } from "@/lib/dates/calendar";
import { SUBJECT_BG, SUBJECT_COLOR_LABEL, SUBJECT_COLORS, type SubjectColor } from "@/lib/subjects/colors";
import { DEFAULT_SUBJECT_ICON, SUBJECT_ICONS } from "@/lib/subjects/icons";
import { sortSlots, type ScheduleSlot } from "@/lib/subjects/schedule";
import { fieldErrors, subjectFormSchema, type Subject, type SubjectForm } from "@/lib/subjects/subjects";
import { friendlyError } from "@/lib/supabase/errors";
import { useSaveSubject } from "./queries";

interface SubjectFormSheetProps {
  open: boolean;
  onClose: () => void;
  /** Editing this subject; without it, creates a new one. */
  subject?: Subject;
  onSaved?: (subject: Subject) => void;
}

function emptyForm(): SubjectForm {
  return { name: "", color: "celeste", icon: DEFAULT_SUBJECT_ICON, professor: "", schedule_slots: [] };
}

function formOf(subject: Subject): SubjectForm {
  return {
    name: subject.name,
    color: subject.color,
    icon: subject.icon ?? DEFAULT_SUBJECT_ICON,
    professor: subject.professor ?? "",
    schedule_slots: sortSlots(subject.schedule_slots),
  };
}

function SlotRow({
  slot,
  index,
  onChange,
  onRemove,
}: {
  slot: ScheduleSlot;
  index: number;
  onChange: (slot: ScheduleSlot) => void;
  onRemove: () => void;
}) {
  const id = useId();
  return (
    <li className="flex flex-col gap-2.5 rounded-lg bg-surface-alt p-3">
      <div className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor={`${id}-day`}>Dia</Label>
          <select
            id={`${id}-day`}
            value={slot.day}
            onChange={(e) => onChange({ ...slot, day: Number(e.target.value) })}
            className="h-11 w-full min-w-0 rounded-md border border-line-strong bg-surface px-3 text-sm text-fg"
          >
            {WEEKDAY_LONG.map((label, i) => (
              <option key={label} value={i + 1}>
                {label.charAt(0).toUpperCase() + label.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex w-28 shrink-0 flex-col gap-1.5">
          <Label htmlFor={`${id}-start`}>Início</Label>
          <Input
            id={`${id}-start`}
            type="time"
            value={slot.start}
            required
            onChange={(e) => onChange({ ...slot, start: e.target.value })}
          />
        </div>
        <IconButton icon={Trash2} label={`Remover aula ${index + 1}`} variant="ghost" onClick={onRemove} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 basis-40 flex-col gap-1.5">
          <Label htmlFor={`${id}-room`}>Sala (opcional)</Label>
          <Input
            id={`${id}-room`}
            value={slot.room ?? ""}
            maxLength={40}
            placeholder="Sala 204"
            onChange={(e) => onChange({ ...slot, room: e.target.value })}
          />
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 self-end text-sm font-medium">
          <input
            type="checkbox"
            checked={slot.lab}
            onChange={(e) => onChange({ ...slot, lab: e.target.checked })}
            className="size-5 accent-btn"
          />
          Laboratório
        </label>
      </div>
    </li>
  );
}

/** Create or edit a subject: name, color, icon, teacher and the weekly classes. */
export function SubjectFormSheet({ open, onClose, subject, onSaved }: SubjectFormSheetProps) {
  const save = useSaveSubject();
  const [form, setForm] = useState<SubjectForm>(() => (subject ? formOf(subject) : emptyForm()));
  const [errors, setErrors] = useState<Partial<Record<keyof SubjectForm, string>>>({});
  const [lastKey, setLastKey] = useState(`${open}-${subject?.id}`);
  const key = `${open}-${subject?.id}`;
  // Fresh form each time the sheet opens (or opens for another subject).
  if (key !== lastKey) {
    setLastKey(key);
    if (open) {
      setForm(subject ? formOf(subject) : emptyForm());
      setErrors({});
    }
  }

  const set = <K extends keyof SubjectForm>(k: K, v: SubjectForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setSlot = (i: number, slot: ScheduleSlot) =>
    set(
      "schedule_slots",
      form.schedule_slots.map((s, j) => (j === i ? slot : s)),
    );

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = subjectFormSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(fieldErrors<keyof SubjectForm>(parsed.error.issues));
      return;
    }
    try {
      const saved = await save.mutateAsync({ id: subject?.id, form: parsed.data });
      toast({ title: subject ? "Matéria atualizada" : "Matéria criada", tone: "success" });
      onSaved?.(saved);
      onClose();
    } catch (error) {
      const message = friendlyError(error);
      // Unique index on active names (23505).
      const duplicate = (error as { code?: string }).code === "23505";
      if (duplicate) setErrors({ name: "Você já tem uma matéria com esse nome." });
      else toast({ title: "Não foi possível salvar", description: message, tone: "danger" });
    }
  }

  const formId = useId();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={subject ? "Editar matéria" : "Nova matéria"}
      size="m"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <Field
          label="Nome"
          value={form.name}
          maxLength={60}
          placeholder="Bioquímica"
          onChange={(e) => set("name", e.target.value)}
          error={errors.name}
          autoFocus={!subject}
        />

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-[13px] font-semibold">Cor</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor">
            {SUBJECT_COLORS.map((color: SubjectColor) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={form.color === color}
                aria-label={SUBJECT_COLOR_LABEL[color]}
                onClick={() => set("color", color)}
                className={cn(
                  "flex size-11 items-center justify-center rounded-full border-2 text-ink",
                  SUBJECT_BG[color],
                  form.color === color ? "border-fg" : "border-transparent",
                )}
              >
                {form.color === color && <Check aria-hidden size={18} strokeWidth={2} />}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-[13px] font-semibold">Ícone</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Ícone">
            {Object.entries(SUBJECT_ICONS).map(([name, { icon: Icon, label }]) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={form.icon === name}
                aria-label={label}
                title={label}
                onClick={() => set("icon", name)}
                className={cn(
                  "flex size-11 items-center justify-center rounded-md border transition-colors duration-150",
                  form.icon === name
                    ? cn("border-transparent text-ink", SUBJECT_BG[form.color])
                    : "border-line bg-surface text-accent hover:bg-surface-alt",
                )}
              >
                <Icon aria-hidden size={20} strokeWidth={1.75} />
              </button>
            ))}
          </div>
        </fieldset>

        <Field
          label="Professor ou professora (opcional)"
          value={form.professor}
          maxLength={80}
          onChange={(e) => set("professor", e.target.value)}
          error={errors.professor}
        />

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 p-0 text-[13px] font-semibold">Aulas da semana</legend>
          <p className="type-caption m-0 text-fg-2">
            Usadas para ordenar por próxima aula, filtrar laboratórios e montar a agenda da semana.
          </p>
          {form.schedule_slots.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {form.schedule_slots.map((slot, i) => (
                <SlotRow
                  key={i}
                  slot={slot}
                  index={i}
                  onChange={(s) => setSlot(i, s)}
                  onRemove={() =>
                    set(
                      "schedule_slots",
                      form.schedule_slots.filter((_, j) => j !== i),
                    )
                  }
                />
              ))}
            </ul>
          )}
          {errors.schedule_slots && <p className="type-caption m-0 text-danger-text">{errors.schedule_slots}</p>}
          <Button
            variant="secondary"
            size="s"
            icon={Plus}
            className="self-start"
            disabled={form.schedule_slots.length >= 14}
            onClick={() => {
              const last = form.schedule_slots.at(-1);
              set("schedule_slots", [
                ...form.schedule_slots,
                {
                  day: last ? Math.min(7, last.day + 2) : 1,
                  start: last?.start ?? "08:00",
                  lab: false,
                  room: last?.room,
                },
              ]);
            }}
          >
            Adicionar aula
          </Button>
          {form.schedule_slots.length > 0 && (
            <p className="type-caption m-0 text-fg-2">
              {sortSlots(form.schedule_slots)
                .map((s) => `${WEEKDAY_SHORT[s.day - 1]} ${s.start}${s.lab ? " (lab)" : ""}`)
                .join(" · ")}
            </p>
          )}
        </fieldset>
      </form>
    </Sheet>
  );
}
