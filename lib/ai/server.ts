import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SourceDocument } from "./context";
import { AiError } from "./generate";
import type { SourceKey } from "./keys";
import type { AiFailure } from "./messages";
import { ProviderError } from "./providers";
import type { UsageLog } from "./generate";
import { pageSourceName } from "@/lib/notebook/format";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * Shared by the AI Route Handlers: her session (RLS decides what can be read), a rate limit per
 * IP, the sources, the quota and the answer as a stream of progress events (NDJSON).
 */

type Client = SupabaseClient<Database>;

export async function sessionClient(): Promise<{ supabase: Client; userId: string } | null> {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  return userId ? { supabase, userId } : null;
}

// --- Rate limit per IP (section 7.12). In memory, per server instance: a brake, not a vault. ---
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;
const hits = new Map<string, number[]>();

export function rateLimited(request: Request, now = Date.now()): boolean {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}

export interface LoadedSources {
  documents: SourceDocument[];
  keys: SourceKey[];
  subjectIds: (string | null)[];
}

/** Her readings that are ready, with the file names and the text. Missing or not ready: left out. */
export async function loadSources(supabase: Client, documentIds: readonly string[]): Promise<LoadedSources> {
  const { data: docs, error } = await supabase
    .from("documents")
    .select(
      "id, status, content_hash, excluded_pages, files(name, subject_id), notebook_pages(position, notebooks(title, subject_id))",
    )
    .in("id", [...documentIds])
    .eq("status", "pronto");
  if (error) throw error;
  const ready = (docs ?? []).filter((d) => d.content_hash);
  if (ready.length === 0) return { documents: [], keys: [], subjectIds: [] };
  const { data: chunks, error: chunksError } = await supabase
    .from("document_chunks")
    .select("document_id, position, page, text")
    .in(
      "document_id",
      ready.map((d) => d.id),
    )
    .order("position")
    .limit(10_000);
  if (chunksError) throw chunksError;
  // In the order she picked them.
  const order = new Map(documentIds.map((id, i) => [id, i]));
  ready.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  // A file, or a notebook page ("Usar no resumo"): its name and subject either way.
  const file = (d: (typeof ready)[number]): { name: string; subject_id: string | null } | null => {
    const f = Array.isArray(d.files) ? d.files[0] : d.files;
    if (f) return f;
    const page = Array.isArray(d.notebook_pages) ? d.notebook_pages[0] : d.notebook_pages;
    const notebook = page && (Array.isArray(page.notebooks) ? page.notebooks[0] : page.notebooks);
    return page && notebook
      ? { name: pageSourceName(notebook.title, page.position), subject_id: notebook.subject_id }
      : null;
  };
  return {
    documents: ready.map((d) => ({
      id: d.id,
      name: file(d)?.name ?? "Arquivo",
      excludedPages: d.excluded_pages,
      chunks: (chunks ?? []).filter((c) => c.document_id === d.id),
    })),
    keys: ready.map((d) => ({ documentId: d.id, contentHash: d.content_hash!, excludedPages: d.excluded_pages })),
    subjectIds: ready.map((d) => file(d)?.subject_id ?? null),
  };
}

// --- Quota ---

export class QuotaError extends Error {
  constructor(readonly failure: AiFailure) {
    super(failure);
  }
}

export async function reserve(supabase: Client, operation: "resumo" | "questoes", requests: number): Promise<string> {
  const { data, error } = await supabase.rpc("ai_reserve", {
    p_operation: operation,
    p_requests: Math.max(1, requests),
  });
  if (error) {
    if (error.code === "LQ002") throw new QuotaError("limite");
    if (error.code === "LQ003") throw new QuotaError("limite_app");
    throw error;
  }
  return data;
}

export async function settle(supabase: Client, id: string, ok: boolean, log: UsageLog) {
  await supabase.rpc("ai_settle", {
    p_id: id,
    p_ok: ok,
    p_provider: log.provider,
    p_model: log.model,
    p_requests: log.requests,
    p_input_tokens: log.inputTokens,
    p_output_tokens: log.outputTokens,
  });
}

/** What she reads for an error thrown while generating. */
export function failureOf(error: unknown): AiFailure {
  if (error instanceof QuotaError) return error.failure;
  if (error instanceof AiError) {
    return { busy: "ocupado", invalid: "invalida", config: "config", empty: "sem_texto" }[error.kind] as AiFailure;
  }
  if (error instanceof ProviderError) return error.kind === "config" ? "config" : "ocupado";
  return "ocupado";
}

// --- Stream of events ---

export type AiEvent =
  | { type: "progress"; message: string }
  | { type: "done"; id: string; cached: boolean }
  | { type: "error"; failure: AiFailure };

/** The answer as one JSON event per line: progress first, then "done" or "error". */
export function eventStream(run: (send: (event: AiEvent) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: AiEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // She left the page: the work goes on and is saved, nobody is listening.
          open = false;
        }
      };
      try {
        await run(send);
      } catch (error) {
        console.error("[ai]", error);
        send({ type: "error", failure: failureOf(error) });
      } finally {
        if (open) controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function jsonError(status: number, failure: AiFailure): Response {
  return Response.json({ type: "error", failure }, { status, headers: { "Cache-Control": "no-store" } });
}
