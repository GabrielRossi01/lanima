"use client";

import type { AiFailure } from "@/lib/ai/messages";

/** Events of the AI Route Handlers (lib/ai/server.ts), one JSON per line. */
type AiEvent =
  | { type: "progress"; message: string }
  | { type: "done"; id: string; cached: boolean }
  | { type: "error"; failure: AiFailure };

export class AiRequestError extends Error {
  constructor(readonly failure: AiFailure) {
    super(failure);
    this.name = "AiRequestError";
  }
}

/**
 * Calls an AI route and follows its progress. Resolves with the saved item's id; rejects with
 * AiRequestError (what to tell her) when it can't be done.
 */
export async function runAi(
  path: "/api/ai/resumo" | "/api/ai/questoes",
  body: unknown,
  onProgress: (message: string) => void,
): Promise<{ id: string; cached: boolean }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new AiRequestError("rede");
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new AiRequestError("rede");
  }
  if (!response.ok || !response.body) {
    const data = (await response.json().catch(() => null)) as { failure?: AiFailure } | null;
    throw new AiRequestError(data?.failure ?? (response.status === 401 ? "sessao" : "ocupado"));
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    let chunk: ReadableStreamReadResult<string>;
    try {
      chunk = await reader.read();
    } catch {
      throw new AiRequestError("rede");
    }
    if (chunk.value) buffer += chunk.value;
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line) continue;
      const event = JSON.parse(line) as AiEvent;
      if (event.type === "progress") onProgress(event.message);
      else if (event.type === "done") return { id: event.id, cached: event.cached };
      else throw new AiRequestError(event.failure);
    }
    if (chunk.done) break;
  }
  // The connection ended without an answer: the work may still finish on the server.
  throw new AiRequestError("rede");
}
