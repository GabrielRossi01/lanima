import { z } from "zod";
import { buildContext } from "@/lib/ai/context";
import { generateQuestions, newLog } from "@/lib/ai/generate";
import { questionsKey } from "@/lib/ai/keys";
import { providersFromEnv } from "@/lib/ai/providers";
import { DIFFICULTIES, QUESTION_TYPES, summaryContentSchema } from "@/lib/ai/schemas";
import { eventStream, jsonError, loadSources, rateLimited, reserve, sessionClient, settle } from "@/lib/ai/server";
import { topicPages } from "@/lib/study/summary";
import { topicKey } from "@/lib/study/test-config";

export const maxDuration = 300;

const count = z.int().min(0).max(60);

const bodySchema = z.object({
  documentIds: z.array(z.uuid()).max(20),
  summaryIds: z.array(z.uuid()).max(10),
  /** Already the proposal: about 1.5× what she wants of each level (lib/ai/generate.ts). */
  counts: z.object({ facil: count, medio: count, dificil: count }),
  types: z.array(z.enum(QUESTION_TYPES)).min(1).max(5),
  topics: z.array(z.string().trim().min(1).max(120)).max(40),
  subjectId: z.uuid().nullable(),
  /** "Gerar outra parecida" and "Gerar mais 5": new questions, never the ones made before. */
  fresh: z.boolean().optional(),
});

/** How many of her latest questions are compared with the new ones (all statuses but discarded). */
const BANK_FOR_DEDUPE = 500;

/**
 * Questions for a test (section 7.5, step 3): her readings (and the summaries' pages for each topic)
 * → the AI → questions in her bank as "gerada", for her to choose. The same request again gives
 * back the same questions without spending quota. The answer's id is the batch key.
 */
export async function POST(request: Request) {
  const session = await sessionClient();
  if (!session) return jsonError(401, "sessao");
  if (rateLimited(request)) return jsonError(429, "ocupado");
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "invalida");
  const { summaryIds, counts, types, topics, subjectId, fresh } = parsed.data;
  if (DIFFICULTIES.every((d) => counts[d] === 0)) return jsonError(400, "invalida");
  const { supabase } = session;

  return eventStream(async (send) => {
    send({ type: "progress", message: "Lendo o conteúdo…" });
    const { data: summaries, error: summariesError } = summaryIds.length
      ? await supabase.from("summaries").select("id, document_ids, content").in("id", summaryIds)
      : { data: [], error: null };
    if (summariesError) throw summariesError;
    const documentIds = [...new Set([...parsed.data.documentIds, ...(summaries ?? []).flatMap((s) => s.document_ids)])];
    const sources = await loadSources(supabase, documentIds);
    const context = buildContext(sources.documents);
    if (context.chunks.length === 0) return send({ type: "error", failure: "sem_texto" });

    // The pages each summary cites for a topic go first for that topic.
    const cited = (summaries ?? []).flatMap((s) => {
      const content = summaryContentSchema.safeParse(s.content);
      return content.success ? topicPages(content.data) : [];
    });
    const topicList = topics.map((title) => ({
      title,
      pages: cited.filter((c) => topicKey(c.title) === topicKey(title)).flatMap((c) => c.pages),
    }));

    const key = await questionsKey({ sources: sources.keys, counts, types, topics });
    if (!fresh) {
      const { data: made } = await supabase
        .from("questions")
        .select("id")
        .eq("batch_key", key)
        .neq("status", "sinalizada")
        .limit(1);
      if (made?.[0]) return send({ type: "done", id: key, cached: true });
    }

    const { data: bank, error: bankError } = await supabase
      .from("questions")
      .select("statement")
      .neq("status", "descartada")
      .order("created_at", { ascending: false })
      .limit(BANK_FOR_DEDUPE);
    if (bankError) throw bankError;

    const providers = providersFromEnv();
    const reservation = await reserve(supabase, "questoes", 1);
    const log = newLog(providers);
    try {
      const { drafts } = await generateQuestions({
        context,
        counts,
        types,
        topics: topicList,
        avoid: (bank ?? []).map((q) => q.statement).reverse(),
        providers,
        log,
        onProgress: (message) => send({ type: "progress", message }),
      });
      if (drafts.length === 0) throw new Error("nenhuma questão nova");
      // A "fresh" batch gets its own key, so the next normal request still finds the first one.
      const batch = fresh
        ? await questionsKey({ sources: sources.keys, counts, types, topics: [...topics, crypto.randomUUID()] })
        : key;
      const { error } = await supabase.from("questions").insert(
        drafts.map((q) => ({
          subject_id: subjectId ?? sources.subjectIds.find(Boolean) ?? null,
          document_id: q.source.documentId,
          summary_id: summaryIds.length === 1 ? summaryIds[0] : null,
          topic: q.topic,
          difficulty: q.difficulty,
          type: q.type,
          statement: q.statement,
          options: q.options,
          answer: q.answer,
          explanation: q.explanation,
          source: q.source,
          status: "gerada",
          origin: "ia",
          batch_key: batch,
          provider: log.provider,
          model: log.model,
        })),
      );
      if (error) throw error;
      await settle(supabase, reservation, true, log);
      send({ type: "done", id: batch, cached: false });
    } catch (error) {
      await settle(supabase, reservation, false, log);
      throw error;
    }
  });
}
