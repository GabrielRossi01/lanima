"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-provider";
import { useProfile } from "@/features/profile/queries";
import { todayIn } from "@/lib/dates/calendar";
import {
  dayOfSession,
  formatFocused,
  summarizeFocus,
  type FocusHistory,
  type FocusSession,
} from "@/lib/focus/sessions";
import { remainingMs, statusOf } from "@/lib/focus/timer";
import { FOCUS_GOAL, formatFocusGoal } from "@/lib/profile/profile";
import { sendSessions, useSessionStore } from "./session-store";
import { useTimerStore } from "./timer-store";
import { focusKey, useFocusHistory } from "./use-focus-summary";

/** Long waits are cut short: a device that slept may fire them late. */
const MAX_WAIT_MS = 30_000;

/**
 * Follows the timer on every screen: when the time is up, records the session, says so and sends it.
 * Renders nothing. One per layout, under the AuthGate.
 */
export function FocusWatcher() {
  const { user } = useAuth();
  const userId = user?.id;
  const { data: profile } = useProfile();
  const goal = profile?.daily_focus_goal_min ?? FOCUS_GOAL.default;
  const queryClient = useQueryClient();
  const loadTimer = useTimerStore((s) => s.load);
  const loadSessions = useSessionStore((s) => s.load);
  const timer = useTimerStore((s) => s.timer);
  const finish = useTimerStore((s) => s.finish);
  useFocusHistory();

  useEffect(() => {
    if (!userId) return;
    loadTimer(userId);
    loadSessions(userId);
  }, [userId, loadTimer, loadSessions]);

  const send = useCallback(async () => {
    if (userId && (await sendSessions(userId))) {
      await queryClient.invalidateQueries({ queryKey: focusKey(userId) });
    }
  }, [userId, queryClient]);

  /** Whether this session is what completed today's goal. */
  const reachedGoal = useCallback(
    (session: FocusSession) => {
      const today = todayIn(new Date());
      if (dayOfSession(session) !== today) return null;
      const history = queryClient.getQueryData<FocusHistory>(focusKey(userId));
      const local = useSessionStore.getState().sessions;
      const after = summarizeFocus(history, [...local, session], today).minutes;
      return after >= goal && after - session.minutes < goal ? after : null;
    },
    [goal, queryClient, userId],
  );

  useEffect(() => {
    if (statusOf(timer) !== "running") return;
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      clearTimeout(id);
      const left = remainingMs(timer, Date.now());
      if (left > 0) {
        id = setTimeout(tick, Math.min(left, MAX_WAIT_MS));
        return;
      }
      void finish().then((ended) => {
        if (!ended) return;
        if (ended.phase === "break") {
          toast({ title: "Pausa concluída", description: "Pronto para a próxima sessão.", tone: "success" });
          return;
        }
        toast({ title: "Sessão de foco concluída", description: "Hora da pausa.", tone: "success" });
        const focused = ended.session && reachedGoal(ended.session);
        if (focused) {
          toast({
            title: "Meta do dia concluída",
            description: `${formatFocused(focused)} focadas hoje, meta de ${formatFocusGoal(goal)}.`,
            tone: "success",
          });
        }
        void send();
      });
    };
    tick();
    // Timers are throttled in the background: catch up as soon as she is back.
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearTimeout(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [timer, finish, reachedGoal, goal, send]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void send();
    };
    const onOnline = () => void send();
    void send();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [send]);

  return null;
}
