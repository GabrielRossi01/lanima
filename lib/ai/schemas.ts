import { z } from "zod";

/**
 * Formats of section 7.5, validated with Zod: what is saved (summaries.content, questions) and
 * what the AI answers. The saved summary keeps the spec's Portuguese keys.
 */

export const DETAILS = ["curto", "medio", "completo"] as const;
export type Detail = (typeof DETAILS)[number];
export const DETAIL_LABELS: Record<Detail, string> = { curto: "Curto", medio: "Médio", completo: "Completo" };

export const DIFFICULTIES = ["facil", "medio", "dificil"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const DIFFICULTY_LABELS: Record<Difficulty, string> = { facil: "Fácil", medio: "Médio", dificil: "Difícil" };

export const QUESTION_TYPES = [
  "multipla_escolha",
  "verdadeiro_falso",
  "associacao",
  "caso_clinico",
  "resposta_curta",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multipla_escolha: "Múltipla escolha",
  verdadeiro_falso: "Verdadeiro ou falso",
  associacao: "Associação",
  caso_clinico: "Caso clínico",
  resposta_curta: "Resposta curta",
};

/** Highlighter colors: the subject colors (section 7.5, "Marca-texto"). */
export const HIGHLIGHTS = ["amarelo", "rosa", "verde", "celeste", "lilas"] as const;

// --- Saved summary ------------------------------------------------------------------------------

export const sourceSchema = z.object({ documentId: z.uuid(), pagina: z.int().min(1).max(5000) });
export type Source = z.infer<typeof sourceSchema>;

export const pointSchema = z.object({
  id: z.string().min(1).max(40),
  texto: z.string().trim().min(1).max(1500),
  /** Null only for a point she wrote by hand. */
  fonte: sourceSchema.nullable(),
  destaque: z.enum(HIGHLIGHTS).nullable().optional(),
});
export type Point = z.infer<typeof pointSchema>;

const baseTopic = z.object({
  id: z.string().min(1).max(40),
  titulo: z.string().trim().min(1).max(200),
  pontos: z.array(pointSchema).max(60),
});
export const topicSchema = baseTopic.extend({ subtopicos: z.array(baseTopic).max(20).optional() });
export type Topic = z.infer<typeof topicSchema>;

export const summaryContentSchema = z.object({
  titulo: z.string().trim().min(1).max(200),
  topicos: z.array(topicSchema).min(1).max(40),
  termosChave: z
    .array(z.object({ termo: z.string().trim().min(1).max(120), definicao: z.string().trim().min(1).max(600) }))
    .max(60),
  pontosDeAtencao: z.array(z.string().trim().min(1).max(600)).max(30),
});
export type SummaryContent = z.infer<typeof summaryContentSchema>;

// --- Saved question -----------------------------------------------------------------------------

export const questionSourceSchema = z.object({
  documentId: z.uuid(),
  page: z.int().min(1).max(5000),
  excerpt: z.string().max(300),
});
export type QuestionSource = z.infer<typeof questionSourceSchema>;

export type QuestionOptions = string[] | { left: string[]; right: string[] } | null;
export type QuestionAnswer = { index: number } | { value: boolean } | { match: number[] } | { text: string };

export interface QuestionDraft {
  topic: string;
  difficulty: Difficulty;
  type: QuestionType;
  statement: string;
  options: QuestionOptions;
  answer: QuestionAnswer;
  explanation: string;
  source: QuestionSource;
}

// --- What the AI answers ------------------------------------------------------------------------
// Every field is required (nullable where it may be missing): Groq's strict mode demands it, and
// Gemini reads the same schema. Sources come as a document label ("D1") and a page; the server
// maps them back to ids and drops anything that points elsewhere.

const aiPoint = z.object({ texto: z.string(), doc: z.string(), pagina: z.int() });
const aiTopic = z.object({ titulo: z.string(), pontos: z.array(aiPoint) });

export const aiSummarySchema = z.object({
  titulo: z.string(),
  topicos: z.array(aiTopic.extend({ subtopicos: z.array(aiTopic) })),
  termosChave: z.array(z.object({ termo: z.string(), definicao: z.string() })),
  pontosDeAtencao: z.array(aiPoint),
});
export type AiSummary = z.infer<typeof aiSummarySchema>;

export const aiQuestionSchema = z.object({
  topico: z.string(),
  dificuldade: z.enum(DIFFICULTIES),
  tipo: z.enum(QUESTION_TYPES),
  enunciado: z.string(),
  alternativas: z.array(z.string()).nullable(),
  correta: z.int().nullable(),
  verdadeiro: z.boolean().nullable(),
  pares: z.array(z.object({ esquerda: z.string(), direita: z.string() })).nullable(),
  respostaEsperada: z.string().nullable(),
  explicacao: z.string(),
  doc: z.string(),
  pagina: z.int(),
  trecho: z.string(),
});
export type AiQuestion = z.infer<typeof aiQuestionSchema>;
export const aiQuestionsSchema = z.object({ questoes: z.array(aiQuestionSchema) });

// JSON Schemas for the providers (written by hand: small, and within what both accept).
type JsonSchema = Record<string, unknown>;
const str: JsonSchema = { type: "string" };
const int: JsonSchema = { type: "integer" };
const object = (properties: Record<string, JsonSchema>): JsonSchema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const array = (items: JsonSchema): JsonSchema => ({ type: "array", items });
const nullable = (schema: JsonSchema): JsonSchema => ({ ...schema, type: [schema.type as string, "null"] });

const pointJson = object({ texto: str, doc: str, pagina: int });
const topicJson = object({ titulo: str, pontos: array(pointJson) });

export const AI_SUMMARY_JSON: JsonSchema = object({
  titulo: str,
  topicos: array(object({ titulo: str, pontos: array(pointJson), subtopicos: array(topicJson) })),
  termosChave: array(object({ termo: str, definicao: str })),
  pontosDeAtencao: array(pointJson),
});

export const AI_QUESTIONS_JSON: JsonSchema = object({
  questoes: array(
    object({
      topico: str,
      dificuldade: { type: "string", enum: [...DIFFICULTIES] },
      tipo: { type: "string", enum: [...QUESTION_TYPES] },
      enunciado: str,
      alternativas: nullable(array(str)),
      correta: nullable(int),
      verdadeiro: nullable({ type: "boolean" }),
      pares: nullable(array(object({ esquerda: str, direita: str }))),
      respostaEsperada: nullable(str),
      explicacao: str,
      doc: str,
      pagina: int,
      trecho: str,
    }),
  ),
});
