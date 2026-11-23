"use client";

import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Field, Input, Label, SelectField } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { dayMonth, daysBetween, relativeDays, type IsoDate } from "@/lib/dates/calendar";
import {
  ASSESSMENT_KIND_LABEL,
  ASSESSMENT_KINDS,
  assessmentFormSchema,
  fieldErrors,
  isAssessmentKind,
  type AssessmentForm,
  type AssessmentRow,
} from "@/lib/subjects/subjects";
import { friendlyError } from "@/lib/supabase/errors";
import { useDeleteAssessment, useSaveAssessment } from "./queries";

function kindLabel(kind: string) {
  return isAssessmentKind(kind) ? ASSESSMENT_KIND_LABEL[kind] : kind;
}

interface AssessmentFormSheetProps {
  open: boolean;
  onClose: () => void;
  subjectId: string;
  today: IsoDate;
  assessment?: AssessmentRow;
}

export function AssessmentFormSheet({ open, onClose, subjectId, today, assessment }: AssessmentFormSheetProps) {
  const save = useSaveAssessment();
  const empty: AssessmentForm = { title: "", kind: "prova", date: today, description: "" };
  const [form, setForm] = useState<AssessmentForm>(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof AssessmentForm, string>>>({});
  const [lastKey, setLastKey] = useState("");
  const key = `${open}-${assessment?.id}`;
  if (key !== lastKey) {
    setLastKey(key);
    if (open) {
      setForm(
        assessment
          ? {
              title: assessment.title,
              kind: isAssessmentKind(assessment.kind) ? assessment.kind : "prova",
              date: assessment.date,
              description: assessment.description ?? "",
            }
          : empty,
      );
      setErrors({});
    }
  }
  const set = <K extends keyof AssessmentForm>(k: K, v: AssessmentForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const formId = useId();
  const dateId = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = assessmentFormSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(fieldErrors<keyof AssessmentForm>(parsed.error.issues));
      return;
    }
    try {
      await save.mutateAsync({ id: assessment?.id, subjectId, form: parsed.data });
      toast({ title: assessment ? "Avaliação atualizada" : "Avaliação marcada", tone: "success" });
      onClose();
    } catch (error) {
      toast({ title: "Não foi possível salvar", description: friendlyError(error), tone: "danger" });
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={assessment ? "Editar avaliação" : "Nova avaliação"}
      size="s"
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
      <form id={formId} onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field
          label="Nome"
          placeholder="P1"
          value={form.title}
          maxLength={120}
          onChange={(e) => set("title", e.target.value)}
          error={errors.title}
          autoFocus={!assessment}
        />
        <SelectField
          label="Tipo"
          value={form.kind}
          onChange={(e) => set("kind", e.target.value as AssessmentForm["kind"])}
        >
          {ASSESSMENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {ASSESSMENT_KIND_LABEL[k]}
            </option>
          ))}
        </SelectField>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={dateId}>Data</Label>
          <Input
            id={dateId}
            type="date"
            value={form.date}
            onChange={(e) => set("date", e.target.value)}
            aria-invalid={errors.date ? true : undefined}
          />
          {errors.date && <p className="type-caption m-0 text-danger-text">{errors.date}</p>}
        </div>
        <Field
          label="Conteúdo (opcional)"
          placeholder="enzimas e metabolismo"
          value={form.description}
          maxLength={160}
          onChange={(e) => set("description", e.target.value)}
          error={errors.description}
        />
      </form>
    </Sheet>
  );
}

/** Countdown pill: "14 dias", "amanhã", "hoje", or the past in muted style. */
export function Countdown({ date, today }: { date: IsoDate; today: IsoDate }) {
  const n = daysBetween(today, date);
  const text = n === 0 ? "hoje" : n === 1 ? "amanhã" : n > 0 ? `${n} dias` : relativeDays(today, date);
  return (
    <span
      className={cn(
        "inline-flex h-[26px] shrink-0 items-center rounded-full px-2.5 text-xs font-semibold whitespace-nowrap",
        n < 0 ? "bg-subtle text-fg-2" : n <= 7 ? "bg-hl-pink text-ink" : "bg-surface-alt text-accent",
      )}
    >
      {text}
    </span>
  );
}

interface AssessmentListProps {
  subjectId: string;
  assessments: readonly AssessmentRow[];
  today: IsoDate;
  /** Compact: upcoming only, no actions (overview card). */
  compact?: boolean;
}

/** Upcoming assessments first (soonest first), then the past ones. */
export function AssessmentList({ subjectId, assessments, today, compact = false }: AssessmentListProps) {
  const remove = useDeleteAssessment();
  const [editing, setEditing] = useState<AssessmentRow | undefined>();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AssessmentRow | undefined>();

  const upcoming = assessments
    .filter((a) => daysBetween(today, a.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const past = assessments.filter((a) => daysBetween(today, a.date) < 0).sort((a, b) => b.date.localeCompare(a.date));
  const shown = compact ? upcoming.slice(0, 3) : upcoming;

  const row = (a: AssessmentRow) => (
    <li key={a.id} className="flex min-w-0 items-center gap-3 rounded-lg bg-surface-alt px-3.5 py-2.5">
      <CalendarClock aria-hidden size={18} strokeWidth={1.75} className="shrink-0 text-accent" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold wrap-break-word">{a.title}</span>
        <span className="text-xs wrap-break-word text-fg-2">
          {kindLabel(a.kind)} · {dayMonth(a.date)}
          {a.description ? ` · ${a.description}` : ""}
        </span>
      </div>
      <Countdown date={a.date} today={today} />
      {!compact && (
        <>
          <IconButton icon={Pencil} label={`Editar ${a.title}`} variant="ghost" onClick={() => setEditing(a)} />
          <IconButton icon={Trash2} label={`Excluir ${a.title}`} variant="ghost" onClick={() => setDeleting(a)} />
        </>
      )}
    </li>
  );

  return (
    <div className="flex flex-col gap-3">
      {shown.length === 0 && (compact || past.length === 0) ? (
        <p className="type-body m-0 text-fg-2">Nenhuma avaliação marcada.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">{shown.map(row)}</ul>
      )}
      {!compact && past.length > 0 && (
        <section aria-label="Avaliações que já passaram" className="flex flex-col gap-2">
          <h3 className="type-overline m-0 text-fg-2">Já passaram</h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">{past.map(row)}</ul>
        </section>
      )}
      {!compact && (
        <Button icon={Plus} variant="secondary" className="self-start" onClick={() => setCreating(true)}>
          Nova avaliação
        </Button>
      )}
      <AssessmentFormSheet
        open={creating || editing !== undefined}
        onClose={() => {
          setCreating(false);
          setEditing(undefined);
        }}
        subjectId={subjectId}
        today={today}
        assessment={editing}
      />
      <ConfirmDialog
        open={deleting !== undefined}
        title="Excluir avaliação?"
        description={deleting ? `“${deleting.title}” de ${dayMonth(deleting.date)} será excluída.` : ""}
        confirmLabel="Excluir"
        danger
        busy={remove.isPending}
        onClose={() => setDeleting(undefined)}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => setDeleting(undefined),
            onError: (error) =>
              toast({ title: "Não foi possível excluir", description: friendlyError(error), tone: "danger" }),
          })
        }
      />
    </div>
  );
}
