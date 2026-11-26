import { z } from "zod";
import { buildContext } from "@/lib/ai/context";
import { generateSummary, newLog, planSummary } from "@/lib/ai/generate";
import { summaryKey } from "@/lib/ai/keys";
import { providersFromEnv } from "@/lib/ai/providers";
import { DETAILS } from "@/lib/ai/schemas";
import { eventStream, jsonError, loadSources, rateLimited, reserve, sessionClient, settle } from "@/lib/ai/server";

/** A summary of big material may take a while (Vercel Hobby allows up to 300 s). */
export const maxDuration = 300;

const bodySchema = z.object({
  documentIds: z.array(z.uuid()).min(1).max(20),
  detail: z.enum(DETAILS),
  focus: z.string().trim().max(200).nullable(),
  subjectId: z.uuid().nullable(),
  /** "Gerar de novo": replaces this summary (she confirmed, if it had edits). */
  replace: z.uuid().nullable().optional(),
});

/**
 * Summary in topics (section 7.5): her readings → the AI → a summary saved in her account.
 * The same request again gives back the summary already made, without spending quota.
 */
export async function POST(request: Request) {
  const session = await sessionClient();
  if (!session) return jsonError(401, "sessao");
  if (rateLimited(request)) return jsonError(429, "ocupado");
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "invalida");
  const { documentIds, detail, focus, subjectId, replace } = parsed.data;
  const { supabase } = session;

  return eventStream(async (send) => {
    send({ type: "progress", message: "Lendo o arquivo…" });
    const sources = await loadSources(supabase, documentIds);
    if (sources.documents.length === 0) return send({ type: "error", failure: "sem_texto" });
    const context = buildContext(sources.documents);
    if (context.chunks.length === 0) return send({ type: "error", failure: "sem_texto" });
    const key = await summaryKey({ sources: sources.keys, detail, focus: focus || null });

    if (!replace) {
      const { data: existing } = await supabase.from("summaries").select("id").eq("input_key", key).limit(1);
      if (existing?.[0]) return send({ type: "done", id: existing[0].id, cached: true });
    }

    const providers = providersFromEnv();
    const plan = planSummary(context, providers);
    const reservation = await reserve(supabase, "resumo", plan.requests);
    const log = newLog(providers);
    try {
      const content = await generateSummary({
        context,
        plan,
        detail,
        focus: focus || null,
        providers,
        log,
        onProgress: (message) => send({ type: "progress", message }),
      });
      const row = {
        subject_id: subjectId ?? sources.subjectIds.find(Boolean) ?? null,
        title: content.titulo,
        document_ids: sources.documents.map((d) => d.id),
        content,
        detail,
        focus: focus || null,
        input_key: key,
        provider: log.provider,
        model: log.model,
      };
      let id: string;
      if (replace) {
        const { data: current, error: readError } = await supabase
          .from("summaries")
          .select("version")
          .eq("id", replace)
          .single();
        if (readError) throw readError;
        const { error } = await supabase
          .from("summaries")
          .update({ ...row, edited_by_user: false, version: current.version + 1 })
          .eq("id", replace);
        if (error) throw error;
        id = replace;
      } else {
        const { data, error } = await supabase.from("summaries").insert(row).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      await settle(supabase, reservation, true, log);
      send({ type: "done", id, cached: false });
    } catch (error) {
      await settle(supabase, reservation, false, log);
      throw error;
    }
  });
}
