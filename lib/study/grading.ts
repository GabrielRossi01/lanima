import { DIFFICULTIES, type Difficulty, type QuestionType } from "@/lib/ai/schemas";
import { addDays, todayIn, type IsoDate } from "@/lib/dates/calendar";
import { permutation } from "@/lib/ai/validate";
import { topicKey } from "./test-config";

/**
 * Taking a test (section 7.5): right or wrong, the score and the results by topic and level. Worked
 * out on the device (also offline, the answers come with the test) with the same rules the
 * database uses (attempt_answers_grade and test_attempts_finish in the 11th migration).
 */

export type Response = { index: number } | { value: boolean } | { match: number[] } | { text: string };
export type SelfAssessment = "acertei" | "parcial" | "errei";

export interface GradableQuestion {
  id: string;
  type: QuestionType;
  difficulty: Difficulty;
  topic: string;
  options: unknown;
  answer: unknown;
}

export interface Answer {
  response: Response | null;
  selfAssessment: SelfAssessment | null;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Right, wrong, or null (blank; or a short answer she hasn't judged, or judged "parcial"). */
export function isCorrect(q: GradableQuestion, a: Answer | undefined): boolean | null {
  if (q.type === "resposta_curta") {
    if (a?.selfAssessment === "acertei") return true;
    if (a?.selfAssessment === "errei") return false;
    return null;
  }
  const response = a?.response as Record<string, unknown> | null | undefined;
  if (!response) return null;
  const answer = (q.answer ?? {}) as Record<string, unknown>;
  if (q.type === "multipla_escolha" || q.type === "caso_clinico")
    return typeof response.index === "number" && response.index === answer.index;
  if (q.type === "verdadeiro_falso") return typeof response.value === "boolean" && response.value === answer.value;
  return Array.isArray(response.match) && same(response.match, answer.match);
}

/** 1 right, 0.5 "parcial", 0 wrong or blank. */
export function creditOf(q: GradableQuestion, a: Answer | undefined): number {
  if (isCorrect(q, a)) return 1;
  return q.type === "resposta_curta" && a?.selfAssessment === "parcial" ? 0.5 : 0;
}

/** Percentage over every question of the attempt, two decimals (numeric(5,2) in the database). */
export function scoreOf(questions: readonly GradableQuestion[], answers: Record<string, Answer | undefined>): number {
  if (questions.length === 0) return 0;
  const credit = questions.reduce((sum, q) => sum + creditOf(q, answers[q.id]), 0);
  return Math.round((10000 * credit) / questions.length) / 100;
}

export function isAnswered(q: GradableQuestion, a: Answer | undefined): boolean {
  if (!a?.response) return false;
  if (q.type === "associacao") {
    const match = (a.response as { match?: number[] }).match ?? [];
    const left = ((q.options ?? {}) as { left?: string[] }).left ?? [];
    return match.length === left.length && match.every((m) => m >= 0);
  }
  if (q.type === "resposta_curta") return Boolean((a.response as { text?: string }).text?.trim());
  return true;
}

/**
 * The order she sees the options in. With "Embaralhar alternativas", a fixed shuffle per attempt
 * and question (the answer keeps the original index).
 */
export function optionOrder(q: GradableQuestion, attemptId: string, shuffle: boolean): number[] {
  const n = Array.isArray(q.options) ? q.options.length : 0;
  if (!shuffle || n < 2) return Array.from({ length: n }, (_, i) => i);
  return permutation(n, `${attemptId}:${q.id}`);
}

export interface Stat {
  label: string;
  right: number;
  total: number;
  /** 0–100. */
  pct: number;
}

/** Below this, the topic goes to "Para revisar" (section 7.5). */
export const REVIEW_BELOW = 60;

function stat(label: string, list: readonly { credit: number }[]): Stat {
  const right = list.reduce((s, x) => s + x.credit, 0);
  return { label, right, total: list.length, pct: list.length ? Math.round((100 * right) / list.length) : 0 };
}

export function byTopic(questions: readonly GradableQuestion[], answers: Record<string, Answer | undefined>): Stat[] {
  const groups = new Map<string, { label: string; items: { credit: number }[] }>();
  for (const q of questions) {
    const key = topicKey(q.topic);
    const group = groups.get(key) ?? { label: q.topic, items: [] };
    group.items.push({ credit: creditOf(q, answers[q.id]) });
    groups.set(key, group);
  }
  return [...groups.values()].map((g) => stat(g.label, g.items));
}

export function byLevel(
  questions: readonly GradableQuestion[],
  answers: Record<string, Answer | undefined>,
): (Stat & { level: Difficulty })[] {
  return DIFFICULTIES.filter((d) => questions.some((q) => q.difficulty === d)).map((d) => ({
    ...stat(
      d,
      questions.filter((q) => q.difficulty === d).map((q) => ({ credit: creditOf(q, answers[q.id]) })),
    ),
    level: d,
  }));
}

/** The questions to do again: everything that wasn't fully right. */
export function wrongOnes<T extends GradableQuestion>(
  questions: readonly T[],
  answers: Record<string, Answer | undefined>,
): T[] {
  return questions.filter((q) => creditOf(q, answers[q.id]) < 1);
}

export interface FinishedAttempt {
  id: string;
  testId: string;
  finishedAt: string;
  score: number;
}

/**
 * Points of a finished test (section 5): 5, plus 3 with 70% or more. Only the first attempt of each
 * test per day (São Paulo) counts.
 */
export function pointsFor(attempt: FinishedAttempt, all: readonly FinishedAttempt[]): number {
  const day = todayIn(new Date(attempt.finishedAt));
  const first = all
    .filter((a) => a.testId === attempt.testId && todayIn(new Date(a.finishedAt)) === day)
    .sort((a, b) => a.finishedAt.localeCompare(b.finishedAt))[0];
  if (first && first.id !== attempt.id) return 0;
  return 5 + (attempt.score >= 70 ? 3 : 0);
}

/**
 * "Acerto médio" (Início): the mean score of the attempts finished in the last 7 days (today and
 * the 6 before, São Paulo), or null without any.
 */
export function averageScore(attempts: readonly FinishedAttempt[], now: Date): number | null {
  const today = todayIn(now);
  const since = addDays(today, -6);
  const recent = attempts.filter((a) => {
    const day = todayIn(new Date(a.finishedAt));
    return a.score >= 0 && day >= since && day <= today;
  });
  if (recent.length === 0) return null;
  return Math.round(recent.reduce((s, a) => s + a.score, 0) / recent.length);
}

/** The São Paulo days with a finished test: they count for the streak (section 5). */
export function testDays(attempts: readonly FinishedAttempt[]): Set<IsoDate> {
  return new Set(attempts.map((a) => todayIn(new Date(a.finishedAt))));
}

/**
 * An answer in words (the result list and the PDF). `pair` joins the two sides of a match: the PDF
 * fonts have no "↔".
 */
export function answerText(q: GradableQuestion, a: Answer | undefined, pair = " ↔ "): string {
  const r = (a?.response ?? null) as Record<string, unknown> | null;
  if (q.type === "resposta_curta") return String(r?.text ?? "").trim() || "em branco";
  if (!r) return "em branco";
  if (q.type === "multipla_escolha" || q.type === "caso_clinico") {
    const options = (q.options as string[] | null) ?? [];
    return options[r.index as number] ?? "em branco";
  }
  if (q.type === "verdadeiro_falso") return r.value ? "Verdadeiro" : "Falso";
  const { left = [], right = [] } = (q.options ?? {}) as { left?: string[]; right?: string[] };
  return left.map((l, i) => `${l}${pair}${right[(r.match as number[] | undefined)?.[i] ?? -1] ?? "?"}`).join("; ");
}

/** The answer key in words. */
export function correctText(q: GradableQuestion, pair?: string): string {
  const key = (q.answer ?? {}) as Record<string, unknown>;
  const response = (q.type === "resposta_curta" ? { text: String(key.text ?? "") } : key) as Response;
  return answerText(q, { response, selfAssessment: null }, pair);
}

/** "22 min", "1h 05min", "40 s". */
export function durationLabel(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}min`;
}

/** "70%", "62,5%". */
export function pctLabel(score: number): string {
  return `${score.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}
