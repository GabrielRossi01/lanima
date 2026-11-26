"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";
import { useAuth } from "@/features/auth/auth-provider";
import { readLocal, writeLocal, type TestAttemptRow } from "@/lib/db/local";
import type { Answer, Response, SelfAssessment } from "@/lib/study/grading";
import { getSupabase } from "@/lib/supabase/client";
import { DataError } from "@/lib/supabase/errors";
import { studyKey, toQuestion, type Question } from "./test-queries";

/**
 * Test attempts, local-first (section 6): written on the device as she answers, corrected here
 * (the answers come with the test) and sent when finished, also later, when the network is back.
 * Attempts and answers only add records, so they never conflict.
 */

const answerSchema = z.object({
  response: z.unknown().nullable(),
  selfAssessment: z.enum(["acertei", "parcial", "errei"]).nullable(),
  timeMs: z.number().min(0),
  marked: z.boolean(),
  /** Treino: she confirmed it and saw the correction. */
  confirmed: z.boolean(),
});

export const localAttemptSchema = z.object({
  id: z.uuid(),
  testId: z.uuid(),
  mode: z.enum(["treino", "prova"]),
  questionIds: z.array(z.uuid()).min(1).max(60),
  shuffle: z.boolean(),
  timeLimitMin: z.number().nullable(),
  startedAt: z.number(),
  finishedAt: z.number().nullable(),
  current: z.int().min(0),
  answers: z.record(z.string(), answerSchema),
  /** The score the database worked out, once it's there. */
  serverScore: z.number().nullable(),
  // A copy of what the result needs, so it opens offline from the device alone.
  title: z.string().optional(),
  subjectId: z.string().nullable().optional(),
  summaryIds: z.array(z.string()).optional(),
  questions: z.array(z.record(z.string(), z.unknown())).optional(),
});

export type LocalAnswer = Omit<z.infer<typeof answerSchema>, "response"> & { response: Response | null };
export type LocalAttempt = Omit<z.infer<typeof localAttemptSchema>, "answers" | "questions"> & {
  answers: Record<string, LocalAnswer>;
  questions?: Question[];
};

export const attemptsKey = (userId: string | undefined) => studyKey(userId, "attempts");
/** Not under "study": read from the device, so never copied into the persisted cache. */
export const localAttemptsKey = (userId: string | undefined) => ["local-attempts", userId] as const;
export const testQuestionsKey = (userId: string | undefined, testId: string) =>
  studyKey(userId, "test-questions", testId);

/** Where IndexedDB can't be used, attempts live here for this visit. */
const memory = new Map<string, TestAttemptRow>();

function parse(row: TestAttemptRow): { attempt: LocalAttempt; sent: boolean } | null {
  const parsed = localAttemptSchema.safeParse(row.attempt);
  return parsed.success ? { attempt: parsed.data as LocalAttempt, sent: row.sent } : null;
}

export async function saveAttempt(userId: string, attempt: LocalAttempt, sent = false): Promise<void> {
  const row: TestAttemptRow = { userId, id: attempt.id, testId: attempt.testId, attempt, sent };
  const saved = await writeLocal(userId, (db) => db.testAttempts.put(row));
  if (saved) memory.delete(attempt.id);
  else memory.set(attempt.id, row);
}

export async function localAttempts(userId: string): Promise<{ attempt: LocalAttempt; sent: boolean }[]> {
  const stored = (await readLocal((db) => db.testAttempts.where({ userId }).toArray())) ?? [];
  const extra = [...memory.values()].filter((m) => m.userId === userId && !stored.some((s) => s.id === m.id));
  return [...stored, ...extra].flatMap((row) => parse(row) ?? []);
}

/** Finished here and not on the server yet (sign-out warns before they're lost). */
export async function countUnsentAttempts(userId: string): Promise<number> {
  return (await localAttempts(userId)).filter((a) => !a.sent && a.attempt.finishedAt !== null).length;
}

export async function deleteLocalAttempt(userId: string, id: string): Promise<void> {
  memory.delete(id);
  await writeLocal(userId, (db) => db.testAttempts.delete([userId, id]));
}

export function useLocalAttempts() {
  const userId = useAuth().user?.id;
  return useQuery({
    queryKey: localAttemptsKey(userId),
    enabled: Boolean(userId),
    queryFn: () => localAttempts(userId!),
    // Read from the device: also offline (TanStack pauses queries without network by default).
    networkMode: "always",
    staleTime: 0,
    gcTime: 0,
  });
}

export interface ServerAttempt {
  id: string;
  test_id: string;
  mode: "treino" | "prova";
  question_ids: string[];
  started_at: string;
  finished_at: string | null;
  score: number | null;
  completed: boolean;
}

function check<T>(result: { data: T | null; error: { message: string; code?: string } | null; status: number }) {
  if (result.error) throw new DataError(result.error.message, { status: result.status, code: result.error.code });
  return result.data as NonNullable<T>;
}

/** Her finished attempts on the server, newest first (kept on the device). */
export function useServerAttempts() {
  const userId = useAuth().user?.id;
  return useQuery({
    queryKey: attemptsKey(userId),
    enabled: Boolean(userId),
    queryFn: async () =>
      check(
        await getSupabase()
          .from("test_attempts")
          .select("id, test_id, mode, question_ids, started_at, finished_at, score, completed")
          .eq("completed", true)
          .order("finished_at", { ascending: false })
          .limit(500),
      ).map((a) => ({ ...a, score: a.score === null ? null : Number(a.score) }) as ServerAttempt),
  });
}

/** The questions of a test, in its order (kept on the device, so the test can be taken offline). */
export function useTestQuestions(testId: string | null, questionIds: readonly string[] | undefined) {
  const userId = useAuth().user?.id;
  return useQuery({
    queryKey: testQuestionsKey(userId, testId ?? ""),
    enabled: Boolean(userId && testId && questionIds?.length),
    queryFn: async (): Promise<Question[]> => {
      const rows = check(
        await getSupabase()
          .from("questions")
          .select("*")
          .in("id", [...questionIds!]),
      ).map(toQuestion);
      const byId = new Map(rows.map((q) => [q.id, q]));
      return questionIds!.flatMap((id) => byId.get(id) ?? []);
    },
  });
}

/**
 * Questions of an attempt, in its order (kept on the device). Right after a test, offline too: they
 * start from the test's questions already on the device.
 */
export function useQuestionsByIds(ids: readonly string[] | undefined) {
  const queryClient = useQueryClient();
  const userId = useAuth().user?.id;
  return useQuery({
    queryKey: studyKey(userId, "questions-by-id", ...(ids ?? [])),
    enabled: Boolean(ids?.length),
    initialData: () => {
      if (!ids?.length) return undefined;
      for (const [, data] of queryClient.getQueriesData<Question[]>({ queryKey: studyKey(userId, "test-questions") })) {
        const byId = new Map((data ?? []).map((q) => [q.id, q]));
        if (ids.every((id) => byId.has(id))) return ids.map((id) => byId.get(id)!);
      }
      return undefined;
    },
    queryFn: async (): Promise<Question[]> => {
      const rows = check(
        await getSupabase()
          .from("questions")
          .select("*")
          .in("id", [...ids!]),
      ).map(toQuestion);
      const byId = new Map(rows.map((q) => [q.id, q]));
      return ids!.flatMap((id) => byId.get(id) ?? []);
    },
  });
}

export function useAnswers(attemptId: string | null) {
  const userId = useAuth().user?.id;
  return useQuery({
    queryKey: studyKey(userId, "answers", attemptId),
    enabled: Boolean(attemptId),
    queryFn: () => fetchAnswers(attemptId!),
  });
}

/** Answers of an attempt made on another device (or already cleared here). */
export async function fetchAnswers(attemptId: string): Promise<Record<string, Answer>> {
  const rows = check(
    await getSupabase()
      .from("attempt_answers")
      .select("question_id, response, self_assessment")
      .eq("attempt_id", attemptId),
  );
  return Object.fromEntries(
    rows.map((r) => [
      r.question_id,
      { response: r.response as Response | null, selfAssessment: r.self_assessment as SelfAssessment | null },
    ]),
  );
}

// --- Sending -----------------------------------------------------------------------------------

const SEND_TIMEOUT_MS = 15_000;

type SendOutcome = "sent" | "offline" | "failed";

async function sendOne(userId: string, attempt: LocalAttempt): Promise<SendOutcome> {
  const db = getSupabase();
  const timeout = () => AbortSignal.timeout(SEND_TIMEOUT_MS);
  const offline = (r: { status: number }) => r.status === 0;

  // 1. The attempt (sent before, or by another tab: nothing to do).
  const created = await db
    .from("test_attempts")
    .upsert(
      {
        id: attempt.id,
        test_id: attempt.testId,
        mode: attempt.mode,
        question_ids: attempt.questionIds,
        started_at: new Date(attempt.startedAt).toISOString(),
      },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .abortSignal(timeout());
  if (created.error) return offline(created) ? "offline" : "failed";

  // Already finished on the server (an earlier send whose answer was lost): only its score is missing here.
  const current = await db.from("test_attempts").select("completed, score").eq("id", attempt.id).abortSignal(timeout());
  if (current.error) return offline(current) ? "offline" : "failed";
  if (current.data[0]?.completed) {
    await saveAttempt(userId, { ...attempt, serverScore: Number(current.data[0].score) }, true);
    return "sent";
  }

  // 2. The answers given (blank ones count as wrong without a row).
  const rows = Object.entries(attempt.answers)
    .filter(([, a]) => a.response !== null || a.selfAssessment !== null || a.marked)
    .map(([questionId, a]) => ({
      attempt_id: attempt.id,
      question_id: questionId,
      response: a.response,
      self_assessment: a.selfAssessment,
      time_ms: Math.min(Math.round(a.timeMs), 86_400_000),
      marked: a.marked,
    }));
  if (rows.length > 0) {
    // An earlier send may have stored some: the same answers (the attempt is finished), keep them.
    let answered = await db
      .from("attempt_answers")
      .upsert(rows, { onConflict: "attempt_id,question_id", ignoreDuplicates: true })
      .abortSignal(timeout());
    // A question deleted from her bank meanwhile: the others still count.
    if (answered.error?.code === "23503") {
      const known = check(
        await db
          .from("questions")
          .select("id")
          .in(
            "id",
            rows.map((r) => r.question_id),
          ),
      );
      const ids = new Set(known.map((k) => k.id));
      answered = await db
        .from("attempt_answers")
        .upsert(
          rows.filter((r) => ids.has(r.question_id)),
          { onConflict: "attempt_id,question_id", ignoreDuplicates: true },
        )
        .abortSignal(timeout());
    }
    if (answered.error) return offline(answered) ? "offline" : "failed";
  }

  // 3. Finished: the database works out the score.
  const finished = await db
    .from("test_attempts")
    .update({ completed: true, finished_at: new Date(attempt.finishedAt!).toISOString() })
    .eq("id", attempt.id)
    .eq("completed", false)
    .select("score")
    .abortSignal(timeout());
  if (finished.error) return offline(finished) ? "offline" : "failed";
  await saveAttempt(userId, { ...attempt, serverScore: Number(finished.data[0]?.score ?? 0) }, true);
  return "sent";
}

let sending: Promise<number> | undefined;

/** Sends every finished attempt still on the device only. Resolves to how many went. */
export function sendAttempts(userId: string): Promise<number> {
  sending ??= (async () => {
    let sent = 0;
    try {
      for (const { attempt, sent: done } of await localAttempts(userId)) {
        if (done || attempt.finishedAt === null) continue;
        const outcome = await sendOne(userId, attempt);
        if (outcome === "offline") break;
        if (outcome === "sent") sent++;
      }
    } finally {
      sending = undefined;
    }
    return sent;
  })();
  return sending;
}

/** Sends what is waiting when a study screen opens and when the network comes back. */
export function useAttemptSync() {
  const userId = useAuth().user?.id;
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const run = async () => {
      const sent = await sendAttempts(userId);
      if (sent > 0) {
        void queryClient.invalidateQueries({ queryKey: attemptsKey(userId) });
        void queryClient.invalidateQueries({ queryKey: localAttemptsKey(userId) });
      }
    };
    void run();
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, [userId, queryClient]);
}

export function newAttempt(input: {
  testId: string;
  mode: "treino" | "prova";
  questionIds: string[];
  shuffle: boolean;
  timeLimitMin: number | null;
  title: string;
  subjectId: string | null;
  summaryIds: string[];
  questions: Question[];
}): LocalAttempt {
  return {
    id: crypto.randomUUID(),
    ...input,
    startedAt: Date.now(),
    finishedAt: null,
    current: 0,
    answers: {},
    serverScore: null,
  };
}

export function emptyAnswer(): LocalAnswer {
  return { response: null, selfAssessment: null, timeMs: 0, marked: false, confirmed: false };
}
