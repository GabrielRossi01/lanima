"use client";

import type { QueryClient } from "@tanstack/react-query";
import { permutation } from "@/lib/ai/validate";
import { wrongOnes, type Answer } from "@/lib/study/grading";
import { getSupabase } from "@/lib/supabase/client";
import { testsKey, type Question, type SavedTest } from "./test-queries";

/**
 * "Refazer só as erradas" (section 7.5): a new test with the questions that weren't fully right,
 * shuffled with the attempt as seed. Needs the network (the test is saved on the server).
 * Returns the new test's id, or null when nothing was wrong.
 */
export async function createRedoTest(input: {
  test: SavedTest;
  questions: readonly Question[];
  answers: Record<string, Answer | undefined>;
  attemptId: string;
  userId: string | undefined;
  queryClient: QueryClient;
}): Promise<string | null> {
  const wrong = wrongOnes(input.questions, input.answers);
  if (wrong.length === 0) return null;
  const ids = wrong.map((q) => q.id);
  const order = permutation(ids.length, input.attemptId).map((i) => ids[i]);
  const counts = { facil: 0, medio: 0, dificil: 0 };
  for (const q of wrong) counts[q.difficulty]++;
  const config: SavedTest["config"] = { ...input.test.config, counts };
  const { data, error } = await getSupabase()
    .from("tests")
    .insert({
      title: `${input.test.title} · erradas`.slice(0, 200),
      subject_id: input.test.subject_id,
      config,
      question_ids: order,
    })
    .select("id")
    .single();
  if (error) throw error;
  await input.queryClient.invalidateQueries({ queryKey: testsKey(input.userId) });
  return data.id;
}
