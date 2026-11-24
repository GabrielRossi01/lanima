import { z } from "zod";
import { daysBetween, isIsoDate, relativeDays, type IsoDate } from "@/lib/dates/calendar";
import type { Database } from "@/lib/supabase/database.types";
import { SUBJECT_COLORS, type SubjectColor } from "./colors";
import { hasLab, minutesToNextClass, parseSlots, scheduleSchema, type ScheduleSlot } from "./schedule";

type Tables = Database["public"]["Tables"];
export type SubjectRow = Tables["subjects"]["Row"];
export type TopicRow = Tables["subject_topics"]["Row"];
export type AssessmentRow = Tables["assessments"]["Row"];

export interface Subject extends Omit<SubjectRow, "color" | "schedule_slots"> {
  color: SubjectColor;
  schedule_slots: ScheduleSlot[];
}

export function toSubject(row: SubjectRow): Subject {
  const color = (SUBJECT_COLORS as readonly string[]).includes(row.color) ? (row.color as SubjectColor) : "celeste";
  return { ...row, color, schedule_slots: parseSlots(row.schedule_slots) };
}

export const ASSESSMENT_KINDS = ["prova", "pratica", "exame", "seminario", "entrega"] as const;
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];

export const ASSESSMENT_KIND_LABEL: Record<AssessmentKind, string> = {
  prova: "Prova",
  pratica: "Prova prática",
  exame: "Exame",
  seminario: "Seminário",
  entrega: "Entrega",
};

export function isAssessmentKind(value: string): value is AssessmentKind {
  return (ASSESSMENT_KINDS as readonly string[]).includes(value);
}

export function assessmentKindLabel(kind: string): string {
  return isAssessmentKind(kind) ? ASSESSMENT_KIND_LABEL[kind] : kind;
}

/** Make-up exam ("prova de recuperação"): shown in red wherever it appears. */
export function isExam(assessment: Pick<AssessmentRow, "kind">): boolean {
  return assessment.kind === "exame";
}

/** Tests, as opposed to seminars and hand-ins. */
export function isTest(assessment: Pick<AssessmentRow, "kind">): boolean {
  return assessment.kind === "prova" || assessment.kind === "pratica" || isExam(assessment);
}

/** Checked by the student. Lists saved on the device before this column existed don't have it. */
export function isCompleted(assessment: { completed_at?: string | null }): boolean {
  return Boolean(assessment.completed_at);
}

// ---------------------------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------------------------

export const subjectFormSchema = z.object({
  name: z.string().trim().min(1, { error: "Dê um nome para a matéria." }).max(60, { error: "Use até 60 caracteres." }),
  color: z.enum(SUBJECT_COLORS),
  icon: z.string().regex(/^[a-z0-9-]{1,40}$/),
  professor: z.string().trim().max(80, { error: "Use até 80 caracteres." }),
  schedule_slots: scheduleSchema,
});
export type SubjectForm = z.infer<typeof subjectFormSchema>;

export const assessmentFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { error: "Dê um nome, como “P1” ou “Prova prática”." })
    .max(120, { error: "Use até 120 caracteres." }),
  kind: z.enum(ASSESSMENT_KINDS),
  date: z.string().refine(isIsoDate, { error: "Escolha a data." }),
  description: z.string().trim().max(160, { error: "Use até 160 caracteres." }),
});
export type AssessmentForm = z.infer<typeof assessmentFormSchema>;

/** First message per field, for forms. */
export function fieldErrors<T extends string>(issues: readonly z.core.$ZodIssue[]): Partial<Record<T, string>> {
  const errors: Partial<Record<T, string>> = {};
  for (const issue of issues) {
    const key = String(issue.path[0]) as T;
    errors[key] ??= issue.message;
  }
  return errors;
}

// ---------------------------------------------------------------------------------------------
// Derived values
// ---------------------------------------------------------------------------------------------

/** % of syllabus topics done (0 without topics). */
export function progressOf(topics: readonly Pick<TopicRow, "done">[]): number {
  if (topics.length === 0) return 0;
  return Math.round((topics.filter((t) => t.done).length / topics.length) * 100);
}

/** Assessments still to do from today on (today included), earliest first. */
export function upcomingAssessments<T extends Pick<AssessmentRow, "date" | "completed_at">>(
  assessments: readonly T[],
  today: IsoDate,
): T[] {
  return assessments
    .filter((a) => !isCompleted(a) && daysBetween(today, a.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function nextAssessment<T extends Pick<AssessmentRow, "date" | "completed_at">>(
  assessments: readonly T[],
  today: IsoDate,
): T | undefined {
  return upcomingAssessments(assessments, today)[0];
}

/** "P1 em 6 dias", "Prova teórica 1 hoje", "Seminário amanhã". */
export function assessmentPill(assessment: Pick<AssessmentRow, "title" | "date">, today: IsoDate): string {
  return `${assessment.title} ${relativeDays(today, assessment.date)}`;
}

/** Topics in display order. */
export function sortTopics<T extends Pick<TopicRow, "position" | "created_at">>(topics: readonly T[]): T[] {
  return [...topics].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
}

/**
 * Position for an item moved to `index` among `ordered` (the list without the moved item):
 * the midpoint between its new neighbours, so only that row is written.
 */
export function positionAt(ordered: readonly { position: number }[], index: number): number {
  const before = ordered[index - 1]?.position;
  const after = ordered[index]?.position;
  if (before === undefined && after === undefined) return 1;
  if (before === undefined) return after! - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}

export const UPCOMING_EXAM_DAYS = 14;

export type SubjectFilter = "todas" | "prova" | "lab" | "arquivadas";
export type SubjectSort = "proxima-aula" | "proxima-avaliacao" | "nome";

export interface SubjectSummary {
  subject: Subject;
  topics: TopicRow[];
  progress: number;
  next?: AssessmentRow;
  /** Last change to the subject or one of its topics (ISO timestamp). */
  lastActivity: string;
}

export function summarize(
  subjects: readonly Subject[],
  topics: readonly TopicRow[],
  assessments: readonly AssessmentRow[],
  today: IsoDate,
): SubjectSummary[] {
  return subjects.map((subject) => {
    const own = sortTopics(topics.filter((t) => t.subject_id === subject.id));
    const lastActivity = own.reduce((latest, t) => (t.updated_at > latest ? t.updated_at : latest), subject.updated_at);
    return {
      subject,
      topics: own,
      progress: progressOf(own),
      next: nextAssessment(
        assessments.filter((a) => a.subject_id === subject.id),
        today,
      ),
      lastActivity,
    };
  });
}

export function matchesFilter(summary: SubjectSummary, filter: SubjectFilter, today: IsoDate): boolean {
  const { subject, next } = summary;
  if (filter === "arquivadas") return subject.archived;
  if (subject.archived) return false;
  if (filter === "prova") return next !== undefined && daysBetween(today, next.date) <= UPCOMING_EXAM_DAYS;
  if (filter === "lab") return hasLab(subject.schedule_slots);
  return true;
}

export function sortSummaries(
  summaries: readonly SubjectSummary[],
  sort: SubjectSort,
  now: Date,
  today: IsoDate,
): SubjectSummary[] {
  const byName = (a: SubjectSummary, b: SubjectSummary) => a.subject.name.localeCompare(b.subject.name, "pt-BR");
  return [...summaries].sort((a, b) => {
    if (sort === "nome") return byName(a, b);
    if (sort === "proxima-avaliacao") {
      const da = a.next ? daysBetween(today, a.next.date) : Number.POSITIVE_INFINITY;
      const db = b.next ? daysBetween(today, b.next.date) : Number.POSITIVE_INFINITY;
      return da - db || byName(a, b);
    }
    const ma = minutesToNextClass(a.subject.schedule_slots, now);
    const mb = minutesToNextClass(b.subject.schedule_slots, now);
    return ma - mb || byName(a, b);
  });
}

/** "Continuar estudando": the 3 active subjects touched most recently. */
export function recentSubjects(summaries: readonly SubjectSummary[], count = 3): SubjectSummary[] {
  return summaries
    .filter((s) => !s.subject.archived)
    .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity))
    .slice(0, count);
}

/** Lines pasted from a syllabus → topic titles (bullets and numbering removed, no duplicates). */
export function parseSyllabus(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const title = raw
      .replace(/^\s*(?:[-–—•*·▪●◦]|\(?\d{1,3}(?:\.\d{1,3})*[.)]?|[a-zA-Z][.)])\s+/, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
    const key = title.toLocaleLowerCase("pt-BR");
    if (!title || seen.has(key)) continue;
    seen.add(key);
    out.push(title);
  }
  return out;
}
