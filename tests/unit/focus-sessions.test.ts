import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTimerStore } from "@/features/focus/timer-store";
import { clearLocalDb, localDb } from "@/lib/db/local";
import { addDays } from "@/lib/dates/calendar";
import {
  dayOfSession,
  formatFocused,
  RECENT_DAYS,
  sessionOf,
  summarizeFocus,
  type FocusSession,
} from "@/lib/focus/sessions";
import { advance, initialTimer, pause, start, type TimerState } from "@/lib/focus/timer";
import { LAST_USER_KEY } from "@/lib/query/device-cache";

const TODAY = "2026-11-25";
const at = (iso: string) => Date.parse(iso);
/** A session that ended at noon (São Paulo) of `day`, `n` hours earlier if several. */
function session(day: string, minutes = 25, n = 0): FocusSession {
  const endedAt = at(`${day}T15:00:00Z`) - n * 3_600_000;
  return { startedAt: endedAt - minutes * 60_000, endedAt, minutes, subjectId: null };
}
const history = (sessions: FocusSession[], days: { day: string; minutes: number }[] = []) => ({ sessions, days });

describe("sessões de foco", () => {
  it("a sessão termina quando o tempo acabou, com as pausas, não quando o app percebeu", () => {
    const t0 = at("2026-11-25T12:00:00Z");
    let timer = start({ ...initialTimer(), subjectId: "s1" }, t0);
    timer = pause(timer, t0 + 5 * 60_000);
    timer = start(timer, t0 + 15 * 60_000);
    expect(sessionOf(timer)).toEqual({
      startedAt: t0,
      endedAt: t0 + 35 * 60_000,
      minutes: 25,
      subjectId: "s1",
    });
  });

  it("pausa, sessão parada ou em espera não viram sessão", () => {
    const running = start(initialTimer(), 1000);
    expect(sessionOf(initialTimer())).toBeNull();
    expect(sessionOf(pause(running, 2000))).toBeNull();
    expect(sessionOf(start(advance(running), 3000))).toBeNull();
  });

  it("o dia é o do fim, em São Paulo", () => {
    const late = { startedAt: 0, endedAt: at("2026-11-26T02:59:00Z"), minutes: 25, subjectId: null };
    expect(dayOfSession(late)).toBe("2026-11-25");
    expect(dayOfSession({ ...late, endedAt: at("2026-11-26T03:00:00Z") })).toBe("2026-11-26");
  });

  it("soma o dia: minutos, sessões e pontos (10 por hora, sem arredondar para cima)", () => {
    const day = [session(TODAY), session(TODAY, 50, 2), session(addDays(TODAY, -1), 90)];
    expect(summarizeFocus(history(day), [], TODAY)).toEqual({ minutes: 75, sessions: 2, points: 12, streak: 2 });
    expect(summarizeFocus(history([session(TODAY)]), [], TODAY).points).toBe(4);
    expect(summarizeFocus(undefined, [], TODAY)).toEqual({ minutes: 0, sessions: 0, points: 0, streak: 0 });
  });

  it("a mesma sessão, no aparelho e no servidor, conta uma vez", () => {
    const one = session(TODAY);
    const other = session(TODAY, 25, 1);
    expect(summarizeFocus(history([one]), [one, other], TODAY)).toMatchObject({ minutes: 50, sessions: 2 });
  });

  it("sequência: 25 minutos por dia; hoje só soma, e um dia em branco zera", () => {
    const d = (n: number, minutes = 25) => session(addDays(TODAY, -n), minutes);
    const streak = (list: FocusSession[]) => summarizeFocus(history(list), [], TODAY).streak;
    expect(streak([d(1), d(2), d(3)])).toBe(3);
    expect(streak([d(0), d(1), d(2)])).toBe(3);
    expect(streak([d(0, 24), d(1)])).toBe(1);
    expect(streak([d(0), d(2)])).toBe(1);
    expect(streak([d(2), d(3)])).toBe(0);
  });

  it("os dias antigos vêm somados do servidor, e os recentes não contam duas vezes", () => {
    const recent = Array.from({ length: RECENT_DAYS + 1 }, (_, n) => session(addDays(TODAY, -n)));
    const days = Array.from({ length: 40 }, (_, n) => ({ day: addDays(TODAY, -n), minutes: 25 }));
    expect(summarizeFocus(history(recent, days), [], TODAY)).toMatchObject({ minutes: 25, streak: 40 });
  });

  it("formata o tempo", () => {
    expect([0, 25, 60, 105, 120].map(formatFocused)).toEqual(["0m", "25m", "1h", "1h 45m", "2h"]);
  });
});

describe("fim da sessão no aparelho", () => {
  const USER = "ana";
  const store = () => useTimerStore.getState();
  const rows = () => localDb()!.focusSessions.toArray();
  const running = (startedAt: number, updatedAt = 1): TimerState => ({
    ...start(initialTimer(), startedAt),
    updatedAt,
  });

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem(LAST_USER_KEY, JSON.stringify({ id: USER, email: null }));
    await clearLocalDb();
    useTimerStore.setState({ userId: USER, ready: true, timer: initialTimer() });
  });
  afterEach(() => vi.restoreAllMocks());

  it("grava a sessão e passa para a pausa, juntos", async () => {
    const startedAt = Date.now() - 26 * 60_000;
    useTimerStore.setState({ timer: running(startedAt) });
    const ended = await store().finish();
    expect(ended).toMatchObject({ phase: "focus", session: { startedAt, minutes: 25 } });
    expect(store().timer.phase).toBe("break");
    expect(await rows()).toMatchObject([{ userId: USER, startedAt, sent: false }]);
    expect((await localDb()!.focusTimer.get(USER))?.state).toMatchObject({ phase: "break", startedAt: null });
  });

  it("antes da hora não faz nada, e duas chamadas juntas gravam uma vez", async () => {
    useTimerStore.setState({ timer: running(Date.now() - 24 * 60_000) });
    expect(await store().finish()).toBeNull();
    expect(await rows()).toEqual([]);
    useTimerStore.setState({ timer: running(Date.now() - 26 * 60_000) });
    const both = await Promise.all([store().finish(), store().finish()]);
    expect(both.filter(Boolean)).toHaveLength(1);
    expect(await rows()).toHaveLength(1);
  });

  it("uma aba que dormiu não conclui o que outra já pausou", async () => {
    const startedAt = Date.now() - 26 * 60_000;
    const paused = { ...pause(running(startedAt), startedAt + 60_000), updatedAt: 10 };
    await localDb()!.focusTimer.put({ userId: USER, state: paused });
    useTimerStore.setState({ timer: running(startedAt, 5) });
    expect(await store().finish()).toBeNull();
    expect(await rows()).toEqual([]);
    expect(store().timer).toEqual(paused);
  });

  it("pular não grava sessão", async () => {
    useTimerStore.setState({ timer: running(Date.now() - 20 * 60_000) });
    store().act(advance);
    expect(await store().finish()).toBeNull();
    expect(await rows()).toEqual([]);
  });

  it("o fim da pausa não é sessão", async () => {
    const breaking = { ...start(advance(initialTimer()), Date.now() - 6 * 60_000), updatedAt: 1 };
    useTimerStore.setState({ timer: breaking });
    expect(await store().finish()).toEqual({ phase: "break", session: null });
    expect(await rows()).toEqual([]);
  });

  it("a cópia enviada fica 2 dias: outra aba pode ainda não ter a lista nova", async () => {
    const { forgetSent } = await import("@/features/focus/session-store");
    const put = (hoursAgo: number, sent: boolean) => {
      const endedAt = Date.now() - hoursAgo * 3_600_000;
      const s = { startedAt: endedAt - 25 * 60_000, endedAt, minutes: 25, subjectId: null };
      return localDb()!
        .focusSessions.put({ userId: USER, startedAt: s.startedAt, session: s, sent })
        .then(() => s);
    };
    const recent = await put(1, true);
    const oldUnsent = await put(72, false);
    const old = await put(60, true);
    const unlisted = await put(61, true);
    await forgetSent(USER, [recent, oldUnsent, old]);
    expect((await rows()).map((r) => r.startedAt).sort()).toEqual(
      [recent, oldUnsent, unlisted].map((s) => s.startedAt).sort(),
    );
  });

  it("sem espaço no aparelho, a sessão ainda conta nesta visita", async () => {
    const { useSessionStore, countUnsent } = await import("@/features/focus/session-store");
    useSessionStore.getState().load(USER);
    vi.spyOn(localDb()!, "transaction").mockRejectedValue(new Error("QuotaExceeded"));
    const startedAt = Date.now() - 30 * 60_000;
    useTimerStore.setState({ timer: running(startedAt) });
    // Without the saved timer to decide, one call still wins.
    const both = await Promise.all([store().finish(), store().finish()]);
    expect(both.filter(Boolean)).toHaveLength(1);
    expect(useSessionStore.getState().sessions).toMatchObject([{ startedAt, sent: false }]);
    expect(await countUnsent(USER)).toBe(1);
  });
});
