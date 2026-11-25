import type { Page } from "@playwright/test";
import { adminClient, seedSubject, type TestAccount } from "./helpers/accounts";
import { expect, test } from "./helpers/fixtures";

// page.route() can't see requests made by the service worker, which handles the Supabase calls.
test.use({ serviceWorkers: "block" });

// These tests wait for real for a session to end (up to 14 s), on top of signing in and two pages.
test.describe.configure({ timeout: 60_000 });

const MINUTE = 60_000;

interface Running {
  startedAt: number;
  focusMin?: number;
  subjectId?: string | null;
}

/** Puts a running session on the device, as if it had started at `startedAt`. */
async function putTimer(page: Page, account: TestAccount, { startedAt, focusMin = 25, subjectId = null }: Running) {
  const state = {
    preset: { focusMin, breakMin: 5 },
    phase: "focus",
    session: 1,
    startedAt,
    pausedAt: null,
    pausedDuration: 0,
    subjectId,
    topicId: null,
    updatedAt: Date.now() + 1000,
  };
  await page.evaluate(
    ([row]) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("lanima");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const tx = request.result.transaction("focusTimer", "readwrite");
          tx.objectStore("focusTimer").put(row);
          tx.onerror = () => reject(tx.error);
          tx.oncomplete = () => {
            request.result.close();
            resolve();
          };
        };
      }),
    [{ userId: account.id, state }] as const,
  );
}

/** The app created its database: it is safe to write to it. */
async function appReady(page: Page) {
  await expect(page.locator("[data-focus-theme][data-ready]")).toBeVisible();
}

/** Opens `path` with a session that has `seconds` left to end. */
async function openEndingIn(page: Page, account: TestAccount, path: string, seconds: number, running = {}) {
  await page.goto("/foco");
  await appReady(page);
  const minutes = (running as Partial<Running>).focusMin ?? 25;
  await putTimer(page, account, { startedAt: Date.now() - minutes * MINUTE + seconds * 1000, ...running });
  await page.goto(path);
}

async function savedSessions(account: TestAccount) {
  const { data, error } = await adminClient()
    .from("focus_sessions")
    .select("*")
    .eq("user_id", account.id)
    .order("started_at");
  if (error) throw error;
  return data;
}

async function seedSession(account: TestAccount, endedAt: number, minutes = 25) {
  const { error } = await adminClient()
    .from("focus_sessions")
    .insert({
      user_id: account.id,
      started_at: new Date(endedAt - minutes * MINUTE).toISOString(),
      ended_at: new Date(endedAt).toISOString(),
      planned_min: minutes,
      actual_min: minutes,
    });
  if (error) throw error;
}

const dots = (page: Page, name: string) => page.getByRole("img", { name, exact: true });
/** Marks the page: gone if it was reloaded. */
const mark = (page: Page) => page.evaluate(() => void ((window as unknown as { __same: boolean }).__same = true));
const same = (page: Page) => page.evaluate(() => (window as unknown as { __same?: boolean }).__same === true);

test.describe("Sessões de foco", () => {
  test("no Modo foco, os números mudam quando a sessão termina, sem recarregar", async ({ page, account }) => {
    const subject = await seedSubject(account, { name: "Bioquímica", color: "rosa" });
    await openEndingIn(page, account, "/foco", 8, { subjectId: subject.id });
    await appReady(page);
    await mark(page);
    await expect(dots(page, "0 de 4")).toBeVisible();
    await expect(page.getByText("0m", { exact: true })).toBeVisible();

    await expect(page.getByText("Sessão de foco concluída")).toBeVisible({ timeout: 15_000 });
    await expect(dots(page, "1 de 4")).toBeVisible();
    await expect(page.getByText("25m", { exact: true })).toBeVisible();
    await expect(page.getByText("+4 pts")).toBeVisible();
    await expect(page.getByText("Sessão 1 de 4 · pausa")).toBeVisible();
    expect(await same(page)).toBe(true);

    await expect.poll(async () => (await savedSessions(account)).length).toBe(1);
    const [saved] = await savedSessions(account);
    expect(saved).toMatchObject({
      subject_id: subject.id,
      kind: "foco",
      planned_min: 25,
      actual_min: 25,
      completed: true,
    });
    expect(Date.parse(saved.ended_at) - Date.parse(saved.started_at)).toBe(25 * MINUTE);
    // Sent and listed by the server: still counted once.
    await page.reload();
    await expect(dots(page, "1 de 4")).toBeVisible();
    await expect(page.getByText("25m", { exact: true })).toBeVisible();
  });

  test("no Início, o card muda na hora e diz quando a meta foi batida", async ({ page, account }) => {
    await adminClient().from("profiles").update({ daily_focus_goal_min: 45 }).eq("id", account.id);
    await seedSession(account, Date.now() - 1000);
    await openEndingIn(page, account, "/inicio", 8);
    await mark(page);
    await expect(page.getByText("Foco hoje · meta 45min")).toBeVisible();
    await expect(page.getByText("25m", { exact: true })).toBeVisible();

    await expect(page.getByText("Sessão de foco concluída")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("50m", { exact: true })).toBeVisible();
    await expect(page.getByText("Foco hoje · meta do dia concluída")).toBeVisible();
    await expect(page.getByText("Meta do dia concluída", { exact: true })).toBeVisible();
    await expect(page.getByText("50m focadas hoje, meta de 45min.")).toBeVisible();
    await expect(page.getByText("1 dia", { exact: true })).toBeVisible();
    expect(await same(page)).toBe(true);
  });

  test("a partir da 5ª sessão, mostra quantas passaram de 4", async ({ page, account }) => {
    for (let i = 0; i < 6; i++) await seedSession(account, Date.now() - i * 1000);
    await page.goto("/foco");
    await expect(dots(page, "6 sessões")).toContainText("+2");
    await expect(page.getByText("2h 30m", { exact: true })).toBeVisible();
    await expect(page.getByText("+25 pts")).toBeVisible();
  });

  test("sessão feita em outro aparelho aparece ao abrir", async ({ page, account }) => {
    await page.goto("/inicio");
    await expect(page.getByText("0m", { exact: true })).toBeVisible();
    await seedSession(account, Date.now());
    await page.reload();
    await expect(page.getByText("25m", { exact: true })).toBeVisible();
  });

  test("pular para a pausa não conta", async ({ page, account }) => {
    await openEndingIn(page, account, "/foco", 600);
    await appReady(page);
    await expect(page.getByRole("button", { name: "Pausar" })).toBeVisible();
    await page.getByRole("button", { name: "Pular para a pausa" }).click();
    await expect(page.getByText("Sessão 1 de 4 · pausa")).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(dots(page, "0 de 4")).toBeVisible();
    expect(await savedSessions(account)).toEqual([]);
  });

  test("com o app fechado, vale o dia em que o tempo acabou", async ({ page, account }) => {
    const startedAt = Date.now() - 24 * 60 * MINUTE;
    await page.goto("/foco");
    await appReady(page);
    await putTimer(page, account, { startedAt });
    await page.goto("/inicio");
    await expect(page.getByText("Sessão de foco concluída")).toBeVisible();
    await expect.poll(async () => (await savedSessions(account)).length).toBe(1);
    expect(Date.parse((await savedSessions(account))[0].ended_at)).toBe(startedAt + 25 * MINUTE);
    // Yesterday's: the streak goes on, and today is still empty.
    await expect(page.getByText("1 dia", { exact: true })).toBeVisible();
    await expect(page.getByText("0m", { exact: true })).toBeVisible();
  });

  test("sem internet conta na hora, sobrevive a recarregar e sobe depois, uma vez só", async ({ page, account }) => {
    let online = false;
    let refused = 0;
    await page.route("**/rest/v1/focus_sessions**", async (route) => {
      if (route.request().method() !== "POST" || online) return route.fallback();
      refused++;
      await route.abort("internetdisconnected");
    });
    await openEndingIn(page, account, "/foco", 6);
    await expect(page.getByText("Sessão de foco concluída")).toBeVisible({ timeout: 15_000 });
    await expect(dots(page, "1 de 4")).toBeVisible();
    await expect.poll(() => refused).toBeGreaterThan(0);
    await page.reload();
    await expect(dots(page, "1 de 4")).toBeVisible();
    // Retried when she comes back, never in a loop.
    await page.waitForTimeout(2000);
    expect(refused).toBeLessThanOrEqual(4);
    expect(await savedSessions(account)).toEqual([]);

    online = true;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect.poll(async () => (await savedSessions(account)).length).toBe(1);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.waitForTimeout(1500);
    expect(await savedSessions(account)).toHaveLength(1);
    await expect(dots(page, "1 de 4")).toBeVisible();
  });

  test("duas abas registram a sessão uma vez", async ({ page, context, account }) => {
    await openEndingIn(page, account, "/foco", 14);
    await appReady(page);
    const other = await context.newPage();
    await other.goto("/inicio");
    await expect(other.getByText("Foco hoje · meta 2h")).toBeVisible();
    await expect(dots(page, "1 de 4")).toBeVisible({ timeout: 25_000 });
    await expect(other.getByText("25m", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => (await savedSessions(account)).length).toBe(1);
    // Once sent and listed, neither tab goes back to zero, whichever one ended the session.
    await page.waitForTimeout(3000);
    expect(await savedSessions(account)).toHaveLength(1);
    await expect(dots(page, "1 de 4")).toBeVisible();
    await expect(other.getByText("25m", { exact: true })).toBeVisible();
  });

  test("a matéria foi excluída enquanto isso: a sessão sobe sem ela", async ({ page, account }) => {
    const subject = await seedSubject(account, { name: "Genética", color: "verde" });
    await openEndingIn(page, account, "/foco", 8, { subjectId: subject.id });
    await appReady(page);
    await adminClient().from("subjects").delete().eq("id", subject.id);
    await expect.poll(async () => (await savedSessions(account)).length, { timeout: 20_000 }).toBe(1);
    expect((await savedSessions(account))[0].subject_id).toBeNull();
  });

  test("sair com sessão não enviada pede confirmação", async ({ page, account }) => {
    await page.route("**/rest/v1/focus_sessions**", (route) =>
      route.request().method() === "POST" ? route.abort("internetdisconnected") : route.fallback(),
    );
    await openEndingIn(page, account, "/foco", 5);
    await expect(dots(page, "1 de 4")).toBeVisible({ timeout: 15_000 });
    await page.goto("/perfil");
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Sair sem enviar?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/perfil$/);
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await dialog.getByRole("button", { name: "Sair mesmo assim" }).click();
    await expect(page).toHaveURL(/\/entrar$/);
    expect(await savedSessions(account)).toEqual([]);
  });
});
