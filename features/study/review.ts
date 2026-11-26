"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { addDays, todayIn } from "@/lib/dates/calendar";
import { byTopic, REVIEW_BELOW, scoreOf, type Answer, type FinishedAttempt, type Stat } from "@/lib/study/grading";
import { getSupabase } from "@/lib/supabase/client";
import { DataError } from "@/lib/supabase/errors";
import type { Response, SelfAssessment } from "@/lib/study/grading";
import { useLocalAttempts, useServerAttempts } from "./attempts";
import { studyKey, useQuestionBank } from "./test-queries";

export interface LastAttempt extends FinishedAttempt {
  /** Finished here, not on the server yet. */
  waiting: boolean;
}

/** Every finished attempt she has: on the server, and finished here but not sent yet. */
export function useFinishedAttempts(): { data: LastAttempt[] | undefined } {
  const server = useServerAttempts();
  const local = useLocalAttempts();
  if (!server.data && !local.data) return { data: undefined };
  const fromServer = (server.data ?? []).map((a) => ({
    id: a.id,
    testId: a.test_id,
    finishedAt: a.finished_at!,
    score: a.score ?? 0,
    waiting: false,
  }));
  const fromHere = (local.data ?? [])
    .filter((l) => l.attempt.finishedAt !== null && !fromServer.some((s) => s.id === l.attempt.id))
    .map((l) => ({
      id: l.attempt.id,
      testId: l.attempt.testId,
      finishedAt: new Date(l.attempt.finishedAt!).toISOString(),
      // Before the server's, the score worked out here from the copy of its questions (-1: unknown).
      score: l.attempt.serverScore ?? (l.attempt.questions ? scoreOf(l.attempt.questions, l.attempt.answers) : -1),
      waiting: !l.sent,
    }));
  return { data: [...fromServer, ...fromHere].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)) };
}

/** The newest finished attempt of each test. */
export function latestByTest(attempts: readonly LastAttempt[]): Map<string, LastAttempt> {
  const map = new Map<string, LastAttempt>();
  for (const a of attempts) if (!map.has(a.testId)) map.set(a.testId, a);
  return map;
}

export interface ReviewTopic extends Stat {
  subjectId: string | null;
}

const RECENT_DAYS = 30;

/**
 * "Para revisar" (Estudo.html): topics under 60% in the latest attempt of each test of the last 30
 * days. Answers come from this device when it has them, otherwise from the server.
 */
export function useReviewTopics(): ReviewTopic[] {
  const userId = useAuth().user?.id;
  const finished = useFinishedAttempts().data ?? [];
  const local = useLocalAttempts().data ?? [];
  const bank = useQuestionBank().data ?? [];
  const serverAttempts = useServerAttempts().data ?? [];
  const since = `${addDays(todayIn(new Date()), -RECENT_DAYS)}T00:00:00Z`;
  const latest = [...latestByTest(finished.filter((a) => a.finishedAt >= since)).values()];
  const missing = latest.filter((a) => !local.some((l) => l.attempt.id === a.id)).map((a) => a.id);

  const remote = useQuery({
    queryKey: studyKey(userId, "review-answers", ...missing),
    enabled: Boolean(userId) && missing.length > 0,
    queryFn: async () => {
      const { data, error, status } = await getSupabase()
        .from("attempt_answers")
        .select("attempt_id, question_id, response, self_assessment")
        .in("attempt_id", missing);
      if (error) throw new DataError(error.message, { status, code: error.code });
      return data;
    },
  });

  const byQuestion = new Map(bank.map((q) => [q.id, q]));
  const pairs: { question: (typeof bank)[number]; answer: Answer | undefined }[] = [];
  for (const attempt of latest) {
    const here = local.find((l) => l.attempt.id === attempt.id)?.attempt;
    const ids = here?.questionIds ?? [];
    const answers: Record<string, Answer> = here
      ? here.answers
      : Object.fromEntries(
          (remote.data ?? [])
            .filter((r) => r.attempt_id === attempt.id)
            .map((r) => [
              r.question_id,
              { response: r.response as Response | null, selfAssessment: r.self_assessment as SelfAssessment | null },
            ]),
        );
    // Blank ones count as wrong too: the attempt's own list of questions.
    const questionIds = here
      ? ids
      : (serverAttempts.find((s) => s.id === attempt.id)?.question_ids ?? Object.keys(answers));
    for (const id of questionIds) {
      const question = byQuestion.get(id);
      if (question) pairs.push({ question, answer: answers[id] });
    }
  }
  const questions = pairs.map((p, i) => ({ ...p.question, id: `${p.question.id}:${i}` }));
  const answers = Object.fromEntries(pairs.map((p, i) => [`${p.question.id}:${i}`, p.answer]));
  return byTopic(questions, answers)
    .filter((s) => s.pct < REVIEW_BELOW)
    .map((s) => ({
      ...s,
      subjectId: pairs.find((p) => p.question.topic === s.label)?.question.subject_id ?? null,
    }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 8);
}
