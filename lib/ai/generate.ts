import type { z } from "zod";
import {
  estimateTokens,
  renderChunks,
  selectForTopics,
  splitByTokens,
  type Context,
  type ContextChunk,
} from "./context";
import { mergeUser, questionsSystem, questionsUser, retryNote, summarySystem, summaryUser } from "./prompts";
import { ProviderError, type Provider, type ProviderRequest, type Providers } from "./providers";
import {
  AI_QUESTIONS_JSON,
  AI_SUMMARY_JSON,
  aiQuestionsSchema,
  aiSummarySchema,
  DIFFICULTIES,
  type AiSummary,
  type Detail,
  type Difficulty,
  type QuestionDraft,
  type QuestionType,
  type SummaryContent,
} from "./schemas";
import { dedupe, toQuestionDraft, toSummaryContent, type Rejection } from "./validate";

/** busy: the providers refused (quota or out); invalid: two answers out of the rules. */
export type AiErrorKind = "busy" | "invalid" | "config" | "empty";

export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export interface UsageLog {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  provider: string;
  model: string;
}

export function newLog(providers: Providers): UsageLog {
  return {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    provider: providers.primary.name,
    model: providers.primary.model,
  };
}

type Progress = (message: string) => void;

const SUMMARY_OUTPUT_TOKENS = 16_000;
const TOKENS_PER_QUESTION = 450;

function fitsIn(provider: Provider, request: ProviderRequest): ProviderRequest | null {
  if (provider.maxTokens === null) return request;
  const input = estimateTokens(request.system + request.user);
  const room = provider.maxTokens - input;
  if (room < 1000) return null;
  return { ...request, maxOutputTokens: Math.min(request.maxOutputTokens, room) };
}

/** One request, on the primary or, when it refuses and the request fits, on the fallback. */
async function call(providers: Providers, request: ProviderRequest, log: UsageLog, signal?: AbortSignal) {
  const attempts: [Provider, ProviderRequest][] = [[providers.primary, request]];
  let lastError: ProviderError | null = null;
  for (let i = 0; i < attempts.length; i++) {
    const [provider, req] = attempts[i];
    try {
      log.requests++;
      const result = await provider.generate(req, signal);
      log.inputTokens += result.inputTokens;
      log.outputTokens += result.outputTokens;
      log.provider = provider.name;
      log.model = provider.model;
      return result.text;
    } catch (error) {
      if (!(error instanceof ProviderError)) throw error;
      // 429 and 5xx count nothing at the provider; a config error is ours to fix.
      if (error.kind === "quota" || error.kind === "unavailable" || error.kind === "too_large") log.requests--;
      if (error.kind === "config") throw new AiError("config", error.message);
      lastError = error;
      const fallback = providers.fallback;
      if (i === 0 && fallback && error.kind !== "bad_response") {
        const fitted = fitsIn(fallback, req);
        if (fitted) attempts.push([fallback, fitted]);
      }
    }
  }
  throw new AiError(
    lastError?.kind === "bad_response" ? "invalid" : "busy",
    lastError?.message ?? "Sem provedor disponível.",
  );
}

/**
 * Asks, parses and checks the answer; if it is out of the format or the rules, asks once more
 * with the error (section 7.12). `accept` returns the result or why it was refused.
 */
async function ask<S extends z.ZodType, T>(
  providers: Providers,
  request: ProviderRequest,
  schema: S,
  accept: (parsed: z.infer<S>) => T | { error: string },
  log: UsageLog,
  signal?: AbortSignal,
): Promise<T> {
  let note = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await call(providers, { ...request, user: request.user + note }, log, signal);
    let error: string;
    try {
      const parsed = schema.safeParse(JSON.parse(text));
      if (parsed.success) {
        const result = accept(parsed.data);
        if (!(result && typeof result === "object" && "error" in result)) return result as T;
        error = (result as { error: string }).error;
      } else {
        error = parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
      }
    } catch {
      error = "o texto não é um JSON válido";
    }
    note = retryNote(error);
  }
  throw new AiError("invalid", "A resposta da IA não passou na validação duas vezes.");
}

// --- Summary ------------------------------------------------------------------------------------

export interface SummaryPlan {
  groups: ContextChunk[][];
  /** Requests to reserve: one per group, plus the one that joins them. */
  requests: number;
}

export function planSummary(context: Context, providers: Providers): SummaryPlan {
  if (context.chunks.length === 0) throw new AiError("empty", "Nenhuma página com texto para resumir.");
  const groups = splitByTokens(context.chunks, providers.maxInputTokens);
  return { groups, requests: groups.length === 1 ? 1 : groups.length + 1 };
}

export async function generateSummary(input: {
  context: Context;
  plan: SummaryPlan;
  detail: Detail;
  focus: string | null;
  providers: Providers;
  log: UsageLog;
  onProgress?: Progress;
  signal?: AbortSignal;
}): Promise<SummaryContent> {
  const { context, plan, detail, focus, providers, log, onProgress, signal } = input;
  const request = (user: string): ProviderRequest => ({
    system: summarySystem(),
    user,
    schema: AI_SUMMARY_JSON,
    schemaName: "resumo",
    maxOutputTokens: SUMMARY_OUTPUT_TOKENS,
  });
  const check = (sent: readonly ContextChunk[]) => (ai: AiSummary) =>
    toSummaryContent(ai, sent) ? ai : { error: "nenhum ponto cita uma página enviada ([Dn p.N])" };

  let final: AiSummary;
  if (plan.groups.length === 1) {
    onProgress?.("Organizando os tópicos…");
    final = await ask(
      providers,
      request(summaryUser({ detail, focus, chunks: renderChunks(context) })),
      aiSummarySchema,
      check(context.chunks),
      log,
      signal,
    );
  } else {
    const partials: AiSummary[] = [];
    for (const [i, group] of plan.groups.entries()) {
      onProgress?.(`Resumindo a parte ${i + 1} de ${plan.groups.length}…`);
      partials.push(
        await ask(
          providers,
          request(summaryUser({ detail, focus, chunks: renderChunks(context, group) })),
          aiSummarySchema,
          check(group),
          log,
          signal,
        ),
      );
    }
    onProgress?.("Juntando as partes…");
    final = await ask(
      providers,
      request(mergeUser({ detail, focus, partials: JSON.stringify(partials) })),
      aiSummarySchema,
      check(context.chunks),
      log,
      signal,
    );
  }
  return toSummaryContent(final, context.chunks)!;
}

// --- Questions ----------------------------------------------------------------------------------

/** About 1.5× what she asked for (section 7.5): she picks the best ones. */
export function proposalCounts(counts: Partial<Record<Difficulty, number>>): Partial<Record<Difficulty, number>> {
  const out: Partial<Record<Difficulty, number>> = {};
  for (const d of DIFFICULTIES) if ((counts[d] ?? 0) > 0) out[d] = Math.ceil(counts[d]! * 1.5);
  return out;
}

export interface QuestionsResult {
  drafts: QuestionDraft[];
  rejected: Partial<Record<Rejection | "duplicada", number>>;
}

export async function generateQuestions(input: {
  context: Context;
  /** Already the proposal (1.5×). */
  counts: Partial<Record<Difficulty, number>>;
  types: readonly QuestionType[];
  topics: readonly { title: string; pages?: readonly { documentId: string; page: number }[] }[];
  /** Statements already in her bank (and flagged ones): not suggested again. */
  avoid: readonly string[];
  providers: Providers;
  log: UsageLog;
  onProgress?: Progress;
  signal?: AbortSignal;
}): Promise<QuestionsResult> {
  const { context, counts, types, topics, avoid, providers, log, onProgress, signal } = input;
  if (context.chunks.length === 0) throw new AiError("empty", "Nenhuma página com texto para as questões.");
  const total = DIFFICULTIES.reduce((sum, d) => sum + (counts[d] ?? 0), 0);
  const sent = selectForTopics(context.chunks, topics, providers.maxInputTokens);
  const difficulties = DIFFICULTIES.filter((d) => (counts[d] ?? 0) > 0);
  const rejected: QuestionsResult["rejected"] = {};

  onProgress?.("Escrevendo as questões…");
  const drafts = await ask(
    providers,
    {
      system: questionsSystem(),
      user: questionsUser({
        counts,
        types,
        topics: topics.map((t) => t.title),
        // The last ones she has are enough to steer the model away; all of them are checked below.
        avoid: avoid.slice(-40),
        known: avoid.length,
        chunks: renderChunks(context, sent),
      }),
      schema: AI_QUESTIONS_JSON,
      schemaName: "questoes",
      maxOutputTokens: Math.min(60_000, 1000 + total * TOKENS_PER_QUESTION),
    },
    aiQuestionsSchema,
    (ai) => {
      const ok: QuestionDraft[] = [];
      for (const q of ai.questoes) {
        const draft = toQuestionDraft(q, sent, { types, difficulties });
        if (typeof draft === "string") rejected[draft] = (rejected[draft] ?? 0) + 1;
        else ok.push(draft);
      }
      if (ok.length === 0) return { error: "nenhuma questão seguiu as regras (fonte, alternativas, gabarito)" };
      return ok;
    },
    log,
    signal,
  );

  const unique = dedupe(drafts, avoid);
  if (unique.length < drafts.length) rejected.duplicada = drafts.length - unique.length;
  // No more than asked of each level.
  const kept: QuestionDraft[] = [];
  for (const d of difficulties) kept.push(...unique.filter((q) => q.difficulty === d).slice(0, counts[d]));
  return { drafts: kept, rejected };
}
