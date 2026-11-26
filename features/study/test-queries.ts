"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { DIFFICULTIES, type Difficulty, type QuestionType } from "@/lib/ai/schemas";
import type { TestConfig } from "@/lib/study/test-config";
import { getSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { DataError } from "@/lib/supabase/errors";

type Tables = Database["public"]["Tables"];
type QuestionRow = Tables["questions"]["Row"];
type TestRow = Tables["tests"]["Row"];

export type QuestionStatus = "gerada" | "aprovada" | "descartada" | "sinalizada";

export interface Question extends Omit<QuestionRow, "difficulty" | "type" | "status" | "source"> {
  difficulty: Difficulty;
  type: QuestionType;
  status: QuestionStatus;
  source: { documentId: string; page: number; excerpt: string } | null;
}

export interface SavedTest extends Omit<TestRow, "config"> {
  config: Partial<TestConfig> & { sources?: { documentIds: string[]; summaryIds: string[] } };
}

export const bankKey = (userId: string | undefined) => ["study", "questions", userId] as const;
export const testsKey = (userId: string | undefined) => ["study", "tests", userId] as const;

function check<T>(result: { data: T | null; error: { message: string; code?: string } | null; status: number }) {
  if (result.error) throw new DataError(result.error.message, { status: result.status, code: result.error.code });
  return result.data as NonNullable<T>;
}

export const toQuestion = (row: QuestionRow) => row as unknown as Question;

/** Her bank: approved questions (reused between tests) and flagged ones (never suggested again). */
export function useQuestionBank() {
  const userId = useAuth().user?.id;
  return useQuery({
    queryKey: bankKey(userId),
    enabled: Boolean(userId),
    queryFn: async () =>
      check(
        await getSupabase()
          .from("questions")
          .select("*")
          .in("status", ["aprovada", "sinalizada"])
          .order("created_at", { ascending: false })
          .limit(2000),
      ).map(toQuestion),
  });
}

export function useTests() {
  const userId = useAuth().user?.id;
  return useQuery({
    queryKey: testsKey(userId),
    enabled: Boolean(userId),
    queryFn: async () =>
      check(await getSupabase().from("tests").select("*").order("created_at", { ascending: false })).map(
        (row) => row as unknown as SavedTest,
      ),
  });
}

/** The questions the AI wrote for one request (lib/ai route "questoes"). */
export async function fetchBatch(batchKey: string): Promise<Question[]> {
  const rows = check(
    await getSupabase().from("questions").select("*").eq("batch_key", batchKey).neq("status", "sinalizada"),
  ).map(toQuestion);
  // One insert: same created_at for all. Easy first, then by statement, the same on every device.
  const level = (q: Question) => DIFFICULTIES.indexOf(q.difficulty);
  return rows.sort((a, b) => level(a) - level(b) || a.statement.localeCompare(b.statement, "pt-BR"));
}

export type QuestionPatch = Pick<Question, "type" | "difficulty" | "topic" | "statement" | "explanation"> & {
  options: unknown;
  answer: unknown;
};

export async function updateQuestion(id: string, patch: QuestionPatch): Promise<Question> {
  const rows = check(
    await getSupabase()
      .from("questions")
      .update(patch as Tables["questions"]["Update"])
      .eq("id", id)
      .select("*"),
  );
  return toQuestion(rows[0]);
}

/** A question she wrote: no source, no AI. */
export async function insertManual(patch: QuestionPatch, subjectId: string | null): Promise<Question> {
  const rows = check(
    await getSupabase()
      .from("questions")
      .insert({
        ...(patch as Tables["questions"]["Insert"]),
        subject_id: subjectId,
        origin: "manual",
        status: "gerada",
      })
      .select("*"),
  );
  return toQuestion(rows[0]);
}

export async function setStatus(ids: readonly string[], status: QuestionStatus): Promise<void> {
  if (ids.length === 0) return;
  check(
    await getSupabase()
      .from("questions")
      .update({ status })
      .in("id", [...ids])
      .select("id"),
  );
}

/**
 * Saves the test (section 7.5): the chosen questions go to the bank as approved, the others of this
 * proposal as discarded, and the test keeps its questions in order.
 */
export async function saveTest(input: {
  title: string;
  subjectId: string | null;
  config: SavedTest["config"];
  questionIds: string[];
  discarded: string[];
  queryClient: QueryClient;
  userId: string;
}): Promise<string> {
  await setStatus(input.questionIds, "aprovada");
  await setStatus(input.discarded, "descartada");
  const rows = check(
    await getSupabase()
      .from("tests")
      .insert({
        title: input.title,
        subject_id: input.subjectId,
        config: input.config as Tables["tests"]["Insert"]["config"],
        question_ids: input.questionIds,
      })
      .select("id"),
  );
  void input.queryClient.invalidateQueries({ queryKey: ["study"] });
  return rows[0].id;
}
