"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { addDays, todayIn, type IsoDate } from "@/lib/dates/calendar";
import { recentSince, summarizeFocus, type FocusHistory, type FocusSummary } from "@/lib/focus/sessions";
import { getSupabase } from "@/lib/supabase/client";
import { DataError } from "@/lib/supabase/errors";
import { forgetSent, useSessionStore } from "./session-store";

export const focusKey = (userId: string | undefined) => ["focus", userId] as const;

function check<T>(result: {
  data: T | null;
  error: { message: string; code?: string } | null;
  status: number;
}): NonNullable<T> {
  if (result.error) throw new DataError(result.error.message, { status: result.status, code: result.error.code });
  return result.data as NonNullable<T>;
}

async function fetchHistory(userId: string): Promise<FocusHistory> {
  const supabase = getSupabase();
  // A day earlier than needed, so no time zone can cut the first day short.
  const from = `${addDays(recentSince(todayIn(new Date())), -1)}T12:00:00Z`;
  const [sessions, days] = await Promise.all([
    supabase
      .from("focus_sessions")
      .select("started_at, ended_at, actual_min, subject_id")
      .eq("kind", "foco")
      .eq("completed", true)
      .gte("ended_at", from)
      .order("ended_at", { ascending: false })
      .limit(1000),
    supabase.from("focus_days").select("day, minutes").order("day", { ascending: false }).limit(1000),
  ]);
  const history: FocusHistory = {
    sessions: check(sessions).map((row) => ({
      startedAt: Date.parse(row.started_at),
      endedAt: Date.parse(row.ended_at),
      minutes: row.actual_min,
      subjectId: row.subject_id,
    })),
    days: check(days).flatMap(({ day, minutes }) => (day && minutes ? [{ day, minutes }] : [])),
  };
  void forgetSent(userId, history.sessions);
  return history;
}

/** Sessions on the server; kept on the device, so the numbers open offline. */
export function useFocusHistory() {
  const { user } = useAuth();
  const userId = user?.id;
  return useQuery({
    queryKey: focusKey(userId),
    enabled: Boolean(userId),
    queryFn: () => fetchHistory(userId!),
  });
}

/** Today's focus and the streak, with the sessions still on this device; null until known. */
export function useFocusSummary(today: IsoDate | null): FocusSummary | null {
  const { data: history } = useFocusHistory();
  const local = useSessionStore((s) => s.sessions);
  return useMemo(
    () => (today && (history || local.length > 0) ? summarizeFocus(history, local, today) : null),
    [history, local, today],
  );
}
