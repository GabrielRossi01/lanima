import { mockGenerate } from "./mock";

/**
 * AI providers (section 7.12): only free plans, called with plain fetch from the server. The model
 * names are not in the code: AI_PRIMARY_* and AI_FALLBACK_* environment variables, because free
 * models and quotas change often.
 */

export interface ProviderRequest {
  system: string;
  user: string;
  /** JSON Schema of the answer (lib/ai/schemas.ts). */
  schema: Record<string, unknown>;
  schemaName: string;
  maxOutputTokens: number;
}

export interface ProviderResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface Provider {
  name: string;
  model: string;
  /** Biggest request (input + expected output, in tokens) it can take; null: no practical limit. */
  maxTokens: number | null;
  generate(request: ProviderRequest, signal?: AbortSignal): Promise<ProviderResult>;
}

/** quota: 429; unavailable: 5xx or network; too_large: the request doesn't fit; config: key/model. */
export type ProviderErrorKind = "quota" | "unavailable" | "too_large" | "config" | "bad_response";

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly provider?: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

const TIMEOUT_MS = 120_000;

function kindFromStatus(status: number): ProviderErrorKind {
  if (status === 429) return "quota";
  if (status === 413) return "too_large";
  if (status === 400 || status === 401 || status === 403 || status === 404) return "config";
  return "unavailable";
}

async function post(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  provider: string,
  signal?: AbortSignal,
) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    throw new ProviderError("unavailable", `${provider}: ${(error as Error).message}`, provider);
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new ProviderError(kindFromStatus(response.status), `${provider} ${response.status}: ${detail}`, provider);
  }
  return response.json() as Promise<unknown>;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
}

/** Gemini API (Google AI Studio), generateContent with a JSON schema. */
export function gemini(model: string, apiKey: string): Provider {
  return {
    name: "google",
    model,
    maxTokens: null,
    async generate(request, signal) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const data = (await post(
        url,
        { "x-goog-api-key": apiKey },
        {
          systemInstruction: { parts: [{ text: request.system }] },
          contents: [{ role: "user", parts: [{ text: request.user }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema: request.schema,
            maxOutputTokens: request.maxOutputTokens,
          },
        },
        "google",
        signal,
      )) as GeminiResponse;
      const candidate = data.candidates?.[0];
      const text = (candidate?.content?.parts ?? [])
        .filter((p) => !p.thought)
        .map((p) => p.text ?? "")
        .join("");
      if (candidate?.finishReason === "MAX_TOKENS")
        throw new ProviderError("bad_response", "google: resposta cortada", "google");
      if (!text)
        throw new ProviderError("bad_response", `google: sem texto (${candidate?.finishReason ?? "?"})`, "google");
      const usage = data.usageMetadata ?? {};
      return {
        text,
        inputTokens: usage.promptTokenCount ?? 0,
        outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
      };
    },
  };
}

interface GroqResponse {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Groq (OpenAI-compatible), structured outputs in strict mode. Its free plan allows few tokens per
 * minute, so it only takes small requests (AI_FALLBACK_MAX_TOKENS).
 */
export function groq(model: string, apiKey: string, maxTokens: number): Provider {
  return {
    name: "groq",
    model,
    maxTokens,
    async generate(request, signal) {
      const data = (await post(
        "https://api.groq.com/openai/v1/chat/completions",
        { Authorization: `Bearer ${apiKey}` },
        {
          model,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: request.schemaName, strict: true, schema: request.schema },
          },
          max_completion_tokens: request.maxOutputTokens,
        },
        "groq",
        signal,
      )) as GroqResponse;
      const choice = data.choices?.[0];
      if (choice?.finish_reason === "length") throw new ProviderError("bad_response", "groq: resposta cortada", "groq");
      const text = choice?.message?.content ?? "";
      if (!text) throw new ProviderError("bad_response", "groq: sem texto", "groq");
      return { text, inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 };
    },
  };
}

/** Simulated provider for the automated tests: no test ever calls a real API (section 7.12). */
export function mock(): Provider {
  return {
    name: "mock",
    model: "simulado",
    maxTokens: null,
    async generate(request) {
      return mockGenerate(request);
    },
  };
}

type Env = Record<string, string | undefined>;

function build(prefix: "PRIMARY" | "FALLBACK", env: Env): Provider | null {
  const name = env[`AI_${prefix}_PROVIDER`]?.trim().toLowerCase();
  const model = env[`AI_${prefix}_MODEL`]?.trim();
  if (!name) return null;
  if (name === "mock") {
    // Never in a real deployment.
    if (env.VERCEL) throw new ProviderError("config", "O provedor simulado não pode ser usado em produção.");
    return mock();
  }
  if (!model) throw new ProviderError("config", `Defina AI_${prefix}_MODEL.`);
  if (name === "google" || name === "gemini") {
    const key = env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) throw new ProviderError("config", "Defina GOOGLE_GENERATIVE_AI_API_KEY.");
    return gemini(model, key);
  }
  if (name === "groq") {
    const key = env.GROQ_API_KEY;
    if (!key) throw new ProviderError("config", "Defina GROQ_API_KEY.");
    return groq(model, key, Number(env.AI_FALLBACK_MAX_TOKENS) || 6000);
  }
  throw new ProviderError("config", `Provedor desconhecido: ${name}.`);
}

export interface Providers {
  primary: Provider;
  fallback: Provider | null;
  /** Biggest input sent in one request to the primary, in tokens (map-reduce above it). */
  maxInputTokens: number;
}

export function providersFromEnv(env: Env = process.env): Providers {
  const primary = build("PRIMARY", env);
  if (!primary) throw new ProviderError("config", "Defina AI_PRIMARY_PROVIDER e AI_PRIMARY_MODEL.");
  let fallback: Provider | null = null;
  try {
    fallback = build("FALLBACK", env);
  } catch {
    // A broken fallback must not stop the primary.
    fallback = null;
  }
  return { primary, fallback, maxInputTokens: Number(env.AI_MAX_INPUT_TOKENS) || 120_000 };
}
