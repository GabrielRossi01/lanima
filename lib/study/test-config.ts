import { normalizeWords } from "@/lib/ai/context";
import { DIFFICULTIES, DIFFICULTY_LABELS, QUESTION_TYPES, type Difficulty, type QuestionType } from "@/lib/ai/schemas";

/**
 * The test wizard (section 7.5, "Criar teste"): what she asks for in step 2 and how the bank and
 * the AI share it. Pure, so the screens and the tests use the same rules.
 */

export const MIN_QUESTIONS = 5;
export const MAX_QUESTIONS = 40;
export const MAX_PER_LEVEL = 20;

export type Counts = Record<Difficulty, number>;
export type TestMode = "treino" | "prova";

export interface TestConfig {
  counts: Counts;
  types: QuestionType[];
  topics: string[];
  mode: TestMode;
  /** Minutes, only in "prova"; null: no clock. */
  timeLimitMin: number | null;
  shuffle: boolean;
  useBank: boolean;
}

export const DEFAULT_CONFIG: TestConfig = {
  counts: { facil: 5, medio: 10, dificil: 5 },
  types: ["multipla_escolha", "verdadeiro_falso", "caso_clinico"],
  topics: [],
  mode: "treino",
  timeLimitMin: null,
  shuffle: true,
  useBank: true,
};

export const TIME_LIMITS = [15, 30, 45, 60, 90] as const;

export function total(counts: Counts): number {
  return DIFFICULTIES.reduce((sum, d) => sum + counts[d], 0);
}

/** Why step 2 can't go on, or null. */
export function configProblem(config: TestConfig): string | null {
  const n = total(config.counts);
  if (n < MIN_QUESTIONS) return `Escolha pelo menos ${MIN_QUESTIONS} questões.`;
  if (n > MAX_QUESTIONS) return `No máximo ${MAX_QUESTIONS} questões por teste.`;
  if (config.types.length === 0) return "Escolha pelo menos um tipo de questão.";
  return null;
}

/** "5 fáceis · 10 médias · 5 difíceis". */
export function countsLabel(counts: Counts): string {
  const words: Record<Difficulty, [string, string]> = {
    facil: ["fácil", "fáceis"],
    medio: ["média", "médias"],
    dificil: ["difícil", "difíceis"],
  };
  return DIFFICULTIES.filter((d) => counts[d] > 0)
    .map((d) => `${counts[d]} ${counts[d] === 1 ? words[d][0] : words[d][1]}`)
    .join(" · ");
}

/** About 1.2 min per question (the mockup's estimate). */
export function minutesLabel(counts: Counts): string {
  return `~${Math.round(total(counts) * 1.2)} min`;
}

export function levelLabel(d: Difficulty): string {
  return DIFFICULTY_LABELS[d];
}

export const LEVEL_HINTS: Record<Difficulty, string> = {
  facil: "Lembrar e reconhecer: definições, nomes, classificações.",
  medio: "Compreender e aplicar: relacionar conceitos, explicar mecanismos.",
  dificil: "Analisar: casos clínicos e questões que juntam dois tópicos.",
};

export const topicKey = (topic: string) => normalizeWords(topic);

export interface BankQuestion {
  id: string;
  topic: string;
  difficulty: Difficulty;
  type: QuestionType;
}

/** Her approved questions that fit the chosen topics and types (section 7.5: "Usar questões do meu banco"). */
export function matchingBank<T extends BankQuestion>(
  bank: readonly T[],
  config: Pick<TestConfig, "topics" | "types">,
): T[] {
  const topics = new Set(config.topics.map(topicKey));
  return bank.filter((q) => config.types.includes(q.type) && (topics.size === 0 || topics.has(topicKey(q.topic))));
}

/**
 * How the test is filled: questions of her bank first (when she wants), the AI writes the rest.
 * The bank's are spread over the topics in turn, so one topic doesn't take every slot.
 */
export function plan<T extends BankQuestion>(
  bank: readonly T[],
  config: TestConfig,
): { fromBank: T[]; toGenerate: Counts } {
  const fromBank: T[] = [];
  const toGenerate: Counts = { facil: 0, medio: 0, dificil: 0 };
  const fitting = config.useBank ? matchingBank(bank, config) : [];
  for (const d of DIFFICULTIES) {
    const level = fitting.filter((q) => q.difficulty === d);
    const byTopic = new Map<string, T[]>();
    for (const q of level) byTopic.set(topicKey(q.topic), [...(byTopic.get(topicKey(q.topic)) ?? []), q]);
    const queues = [...byTopic.values()];
    const taken: T[] = [];
    while (taken.length < config.counts[d] && queues.some((q) => q.length > 0)) {
      for (const queue of queues) {
        const next = queue.shift();
        if (next && taken.length < config.counts[d]) taken.push(next);
      }
    }
    fromBank.push(...taken);
    toGenerate[d] = config.counts[d] - taken.length;
  }
  return { fromBank, toGenerate };
}

/** Questions that start selected in step 3: as many of each level as she asked for, in order. */
export function initialSelection<T extends { id: string; difficulty: Difficulty }>(
  proposal: readonly T[],
  counts: Counts,
): Set<string> {
  const selected = new Set<string>();
  for (const d of DIFFICULTIES) {
    for (const q of proposal.filter((x) => x.difficulty === d).slice(0, counts[d])) selected.add(q.id);
  }
  return selected;
}

/** "Gerar mais 5": spread over the levels she asked for, in proportion. */
export function moreCounts(counts: Counts, n = 5): Counts {
  const sum = total(counts) || 1;
  const out: Counts = { facil: 0, medio: 0, dificil: 0 };
  let given = 0;
  for (const d of DIFFICULTIES) {
    out[d] = Math.floor((counts[d] / sum) * n);
    given += out[d];
  }
  for (const d of [...DIFFICULTIES].sort((a, b) => counts[b] - counts[a])) {
    if (given >= n) break;
    if (counts[d] > 0) {
      out[d]++;
      given++;
    }
  }
  return out;
}

/** Test order: easy, then medium, then hard (each level in the order she saw it). */
export function testOrder<T extends { id: string; difficulty: Difficulty }>(selected: readonly T[]): string[] {
  return DIFFICULTIES.flatMap((d) => selected.filter((q) => q.difficulty === d).map((q) => q.id));
}

export const ALL_TYPES = QUESTION_TYPES;
