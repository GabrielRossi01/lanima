"use client";

import { CalendarClock, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { CheckButton } from "@/components/ui/check-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DateField } from "@/components/ui/date-field";
import { IconButton } from "@/components/ui/icon-button";
import { Field, SelectField } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { daysBetween, formatDate, relativeDays, type IsoDate } from "@/lib/dates/calendar";
import {
  ASSESSMENT_KIND_LABEL,
  ASSESSMENT_KINDS,
  assessmentFormSchema,
  assessmentKindLabel,
  fieldErrors,
  isAssessmentKind,
  isCompleted,
  isExam,
  upcomingAssessments,
  type AssessmentForm,
  type AssessmentRow,
} from "@/lib/subjects/subjects";
import { friendlyError } from "@/lib/supabase/errors";
import { useCompleteAssessment, useDeleteAssessment, useSaveAssessment } from "./queries";

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
              {k === "exame" ? "Exame (recuperação)" : ASSESSMENT_KIND_LABEL[k]}
            </option>
          ))}
        </SelectField>
        <DateField
          label="Data"
          value={form.date}
          onValueChange={(date) => set("date", date)}
          today={today}
          error={errors.date}
        />
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

/** Countdown pill: "14 dias", "amanhã", "hoje", or the past in muted style. Red for make-up exams. */
export function Countdown({ date, today, exam = false }: { date: IsoDate; today: IsoDate; exam?: boolean }) {
  const n = daysBetween(today, date);
  const text = n === 0 ? "hoje" : n === 1 ? "amanhã" : n > 0 ? `${n} dias` : relativeDays(today, date);
  return (
    <span
      className={cn(
        "inline-flex h-[26px] shrink-0 items-center rounded-full px-2.5 text-xs font-semibold whitespace-nowrap",
        n < 0
          ? "bg-subtle text-fg-2"
          : exam
            ? "bg-exam text-white"
            : n <= 7
              ? "bg-hl-pink text-ink"
              : "bg-surface-alt text-accent",
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
  /** Compact: still to do only, no actions (overview card). */
  compact?: boolean;
}

/** To do first (soonest first), then the ones whose day passed unchecked, then the checked ones. */
export function AssessmentList({ subjectId, assessments, today, compact = false }: AssessmentListProps) {
  const remove = useDeleteAssessment();
  const complete = useCompleteAssessment();
  const [editing, setEditing] = useState<AssessmentRow | undefined>();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AssessmentRow | undefined>();

  const upcoming = upcomingAssessments(assessments, today);
  const newestFirst = (a: AssessmentRow, b: AssessmentRow) => b.date.localeCompare(a.date);
  const past = assessments.filter((a) => !isCompleted(a) && daysBetween(today, a.date) < 0).sort(newestFirst);
  const completed = assessments.filter(isCompleted).sort(newestFirst);
  const shown = compact ? upcoming.slice(0, 3) : upcoming;

  const row = (a: AssessmentRow) => {
    const done = isCompleted(a);
    const exam = isExam(a) && !done;
    const Icon = exam ? TriangleAlert : CalendarClock;
    return (
      <li
        key={a.id}
        className={cn(
          "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border-l-4 py-2 pr-2",
          compact ? "pl-2.5" : "pl-1",
          exam ? "border-danger bg-exam-tint" : "border-transparent bg-surface-alt",
        )}
      >
        {compact ? (
          <Icon
            aria-hidden
            size={18}
            strokeWidth={1.75}
            className={cn("mr-1 shrink-0", exam ? "text-danger-text" : "text-accent")}
          />
        ) : (
          <CheckButton
            checked={done}
            label={`${a.title} concluída`}
            onToggle={() =>
              complete.mutate(
                { id: a.id, completed_at: done ? null : new Date().toISOString() },
                {
                  onError: (error) =>
                    toast({ title: "Não foi possível salvar", description: friendlyError(error), tone: "danger" }),
                },
              )
            }
          />
        )}
        <div className="flex min-w-0 flex-1 basis-32 flex-col py-0.5">
          <span className={cn("text-sm font-semibold wrap-break-word", done && "text-fg-2 line-through")}>
            {a.title}
          </span>
          <span className="text-xs wrap-break-word text-fg-2">
            <span className={cn(exam && "font-semibold text-danger-text")}>{assessmentKindLabel(a.kind)}</span> ·{" "}
            {formatDate(a.date)}
            {a.description ? ` · ${a.description}` : ""}
          </span>
        </div>
        {done ? (
          <span className="inline-flex h-[26px] shrink-0 items-center text-xs font-semibold text-success-text">
            Concluída
          </span>
        ) : (
          <Countdown date={a.date} today={today} exam={exam} />
        )}
        {!compact && (
          <span className="ml-auto flex shrink-0">
            <IconButton icon={Pencil} label={`Editar ${a.title}`} variant="ghost" onClick={() => setEditing(a)} />
            <IconButton icon={Trash2} label={`Excluir ${a.title}`} variant="ghost" onClick={() => setDeleting(a)} />
          </span>
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {shown.length === 0 && (compact || assessments.length === 0) ? (
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
      {!compact && completed.length > 0 && (
        <section aria-label="Avaliações concluídas" className="flex flex-col gap-2">
          <h3 className="type-overline m-0 text-fg-2">Concluídas</h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">{completed.map(row)}</ul>
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
        description={deleting ? `“${deleting.title}” de ${formatDate(deleting.date)} será excluída.` : ""}
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
