import { normalizeWords } from "@/lib/ai/context";
import type { Difficulty, QuestionAnswer, QuestionOptions, QuestionType } from "@/lib/ai/schemas";
import { permutation } from "@/lib/ai/validate";

/**
 * Editing a question, or writing one by hand (section 7.5, step 3): the form, and the rules that
 * turn it into what the bank saves. Same rules as the AI's questions, a bit looser on counts.
 */

export interface QuestionForm {
  type: QuestionType;
  difficulty: Difficulty;
  topic: string;
  statement: string;
  /** Multiple choice and clinical case. */
  options: string[];
  correct: number | null;
  /** True or false. */
  value: boolean | null;
  /** Matching: each pair as she sees it in the right association. */
  pairs: { left: string; right: string }[];
  /** Short answer. */
  expected: string;
  explanation: string;
}

export interface SavedQuestion {
  type: QuestionType;
  difficulty: Difficulty;
  topic: string;
  statement: string;
  options: unknown;
  answer: unknown;
  explanation: string;
}

export function emptyForm(type: QuestionType = "multipla_escolha", topic = ""): QuestionForm {
  return {
    type,
    difficulty: "medio",
    topic,
    statement: "",
    options: ["", "", "", ""],
    correct: null,
    value: null,
    pairs: [
      { left: "", right: "" },
      { left: "", right: "" },
      { left: "", right: "" },
    ],
    expected: "",
    explanation: "",
  };
}

/** A saved question in the form (a matching question back in its right pairs). */
export function toForm(q: SavedQuestion): QuestionForm {
  const form = {
    ...emptyForm(q.type, q.topic),
    difficulty: q.difficulty,
    statement: q.statement,
    explanation: q.explanation,
  };
  const answer = (q.answer ?? {}) as Record<string, unknown>;
  if (q.type === "multipla_escolha" || q.type === "caso_clinico") {
    return { ...form, options: [...((q.options as string[]) ?? [])], correct: (answer.index as number) ?? null };
  }
  if (q.type === "verdadeiro_falso") return { ...form, value: (answer.value as boolean) ?? null };
  if (q.type === "associacao") {
    const { left = [], right = [] } = (q.options ?? {}) as { left?: string[]; right?: string[] };
    const match = (answer.match as number[]) ?? [];
    return { ...form, pairs: left.map((l, i) => ({ left: l, right: right[match[i]] ?? "" })) };
  }
  return { ...form, expected: (answer.text as string) ?? "" };
}

const BANNED = /\b(todas|nenhuma) (as|das) (anteriores|alternativas|acima)\b/;

export type FormErrors = Partial<
  Record<"statement" | "topic" | "options" | "answer" | "pairs" | "expected" | "explanation", string>
>;

export function fromForm(form: QuestionForm):
  | {
      ok: true;
      value: {
        type: QuestionType;
        difficulty: Difficulty;
        topic: string;
        statement: string;
        options: QuestionOptions;
        answer: QuestionAnswer;
        explanation: string;
      };
    }
  | { ok: false; errors: FormErrors } {
  const errors: FormErrors = {};
  const statement = form.statement.trim();
  const topic = form.topic.trim();
  const explanation = form.explanation.trim();
  if (statement.length < 5) errors.statement = "Escreva o enunciado.";
  if (statement.length > 4000) errors.statement = "Use até 4.000 caracteres.";
  if (!topic) errors.topic = "Diga o tópico.";
  if (explanation.length > 700) errors.explanation = "Use até 700 caracteres.";

  let options: QuestionOptions = null;
  let answer: QuestionAnswer | null = null;
  if (form.type === "multipla_escolha" || form.type === "caso_clinico") {
    const list = form.options.map((o) => o.trim()).filter(Boolean);
    if (list.length < 2 || list.length > 5) errors.options = "Escreva de 2 a 5 alternativas.";
    else if (new Set(list.map(normalizeWords)).size !== list.length) errors.options = "Há alternativas repetidas.";
    else if (list.some((o) => BANNED.test(normalizeWords(o))))
      errors.options = "Evite “todas as anteriores” e “nenhuma das anteriores”.";
    // The right one counts among the filled options, in the order she wrote them.
    const filled = form.options.map((o, i) => (o.trim() ? i : -1)).filter((i) => i >= 0);
    const index = form.correct === null ? -1 : filled.indexOf(form.correct);
    if (index < 0) errors.answer = "Marque a alternativa correta.";
    options = list;
    answer = { index };
  } else if (form.type === "verdadeiro_falso") {
    if (form.value === null) errors.answer = "Diga se a afirmação é verdadeira ou falsa.";
    answer = { value: Boolean(form.value) };
  } else if (form.type === "associacao") {
    const pairs = form.pairs
      .map((p) => ({ left: p.left.trim(), right: p.right.trim() }))
      .filter((p) => p.left || p.right);
    if (pairs.length < 2 || pairs.length > 6 || pairs.some((p) => !p.left || !p.right))
      errors.pairs = "Preencha de 2 a 6 pares completos.";
    const order = permutation(pairs.length, statement);
    options = { left: pairs.map((p) => p.left), right: order.map((i) => pairs[i]?.right ?? "") };
    answer = { match: pairs.map((_, i) => order.indexOf(i)) };
  } else {
    const text = form.expected.trim();
    if (!text) errors.expected = "Escreva a resposta esperada.";
    if (text.length > 600) errors.expected = "Use até 600 caracteres.";
    answer = { text };
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      type: form.type,
      difficulty: form.difficulty,
      topic: topic.slice(0, 120),
      statement,
      options,
      answer: answer!,
      explanation,
    },
  };
}
