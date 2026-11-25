import type { Page } from "@playwright/test";
import { adminClient, seedSubject, type TestAccount } from "./helpers/accounts";
import { expect, test } from "./helpers/fixtures";
import { describeHorizontalOverflow } from "./helpers/overflow";

// page.route() can't see requests made by the service worker.
test.use({ serviceWorkers: "block" });
test.describe.configure({ timeout: 60_000 });

const MINUTE = 60_000;
/** The app asks for the sound 3 ms after the tap; the dev machine sometimes holds any request for 10 s. */
const DOWNLOAD = { timeout: 15_000 };

async function openFocus(page: Page) {
  await page.goto("/foco");
  await expect(page.locator("[data-focus-theme][data-ready]")).toBeVisible();
}
const start = (page: Page) => page.getByRole("button", { name: "Iniciar", exact: true });
/** The one shown at this width. */
const indicator = (page: Page) => page.getByRole("region", { name: "Sessão de foco" });
const seconds = async (page: Page) => {
  const [min, sec] = (await indicator(page).getByRole("timer").innerText()).split(":").map(Number);
  return min * 60 + sec;
};

/** A short tone as WAV: the test browser has no AAC decoder. */
function tone(): Buffer {
  const rate = 8000;
  const samples = rate * 3;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(3000 * Math.sin(i / 5)), 44 + i * 2);
  return wav;
}

interface Heard {
  started: number;
  stopped: number;
  closed: number;
}

/** Counts what the audio engine does: whether a sound went on, started again or stopped. */
async function listen(page: Page) {
  await page.route("**/sounds/**", (route) => route.fulfill({ contentType: "audio/wav", body: tone() }));
  await page.addInitScript(() => {
    const heard = { started: 0, stopped: 0, closed: 0 };
    (window as unknown as { __heard: typeof heard }).__heard = heard;
    const { start, stop } = AudioBufferSourceNode.prototype;
    AudioBufferSourceNode.prototype.start = function (...args) {
      heard.started++;
      start.apply(this, args as []);
    };
    AudioBufferSourceNode.prototype.stop = function (...args) {
      heard.stopped++;
      stop.apply(this, args as []);
    };
    const { close } = AudioContext.prototype;
    AudioContext.prototype.close = function () {
      heard.closed++;
      return close.call(this);
    };
  });
  return () => page.evaluate(() => (window as unknown as { __heard: Heard }).__heard);
}

async function savedSessions(account: TestAccount) {
  const { data, error } = await adminClient().from("focus_sessions").select("id").eq("user_id", account.id);
  if (error) throw error;
  return data;
}

/** Puts a session on the device that ends in `left` seconds. */
async function putEnding(page: Page, account: TestAccount, left: number) {
  const state = {
    preset: { focusMin: 25, breakMin: 5 },
    phase: "focus",
    session: 1,
    startedAt: Date.now() - 25 * MINUTE + left * 1000,
    pausedAt: null,
    pausedDuration: 0,
    subjectId: null,
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

test.describe("Minimizar o Modo foco", () => {
  test("sem sessão, só há Sair do foco e nenhum indicador", async ({ page, account }) => {
    void account;
    await openFocus(page);
    await expect(page.getByRole("link", { name: "Sair do foco" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Minimizar" })).toHaveCount(0);
    await page.getByRole("link", { name: "Sair do foco" }).click();
    await expect(page).toHaveURL(/\/inicio$/);
    await expect(indicator(page)).toHaveCount(0);
  });

  test("volta para a tela de onde veio, e o tempo segue no indicador", async ({ page, account }) => {
    const subject = await seedSubject(account, { name: "Bioquímica", color: "rosa" });
    await page.goto(`/materias/${subject.id}`);
    await page.getByRole("link", { name: "Estudar com foco" }).click();
    await expect(page.locator("[data-focus-theme][data-ready]")).toBeVisible();
    await start(page).click();
    await page.getByRole("link", { name: "Minimizar" }).click();
    await expect(page).toHaveURL(new RegExp(`/materias/${subject.id}$`));
    await expect(indicator(page)).toHaveCount(1);
    const before = await seconds(page);
    expect(before).toBeGreaterThan(24 * 60 + 30);
    await expect.poll(() => seconds(page)).toBeLessThan(before);

    // Paused from here, it stays paused there.
    await indicator(page).getByRole("button", { name: "Pausar a contagem" }).click();
    await expect(indicator(page).getByText("Parado")).toBeVisible();
    const paused = await seconds(page);
    await page.waitForTimeout(2200);
    expect(await seconds(page)).toBe(paused);
    await indicator(page).getByRole("link", { name: "Voltar ao Modo foco" }).click();
    await expect(page).toHaveURL(/\/foco$/);
    await expect(page.getByRole("button", { name: "Continuar", exact: true })).toBeVisible();
    await expect(indicator(page)).toHaveCount(0);
    await page.getByRole("link", { name: "Minimizar" }).click();
    await indicator(page).getByRole("button", { name: "Continuar a contagem" }).click();
    await expect.poll(() => seconds(page)).toBeLessThan(paused);
    // Survives a reload.
    await page.reload();
    await expect(indicator(page).getByRole("button", { name: "Pausar a contagem" })).toBeVisible();
  });

  test("o som continua ao navegar, sem recomeçar, e para na pausa", async ({ page, account }) => {
    void account;
    const heard = await listen(page);
    await openFocus(page);
    await page.getByRole("button", { name: "Deep Focus", exact: true }).click();
    await start(page).click();
    await expect.poll(async () => (await heard()).started, DOWNLOAD).toBe(1);

    await page.getByRole("link", { name: "Minimizar" }).click();
    await expect(page).toHaveURL(/\/inicio$/);
    await expect(indicator(page)).toBeVisible();
    await page.getByRole("link", { name: "Matérias", exact: true }).first().click();
    await expect(page).toHaveURL(/\/materias$/);
    await indicator(page).getByRole("link", { name: "Voltar ao Modo foco" }).click();
    await expect(page.locator("[data-focus-theme='deep'][data-ready]")).toBeVisible();
    await page.getByRole("link", { name: "Minimizar" }).click();
    await expect(indicator(page)).toBeVisible();
    await page.waitForTimeout(600);
    expect(await heard()).toEqual({ started: 1, stopped: 0, closed: 0 });

    await indicator(page).getByRole("button", { name: "Pausar a contagem" }).click();
    await expect.poll(async () => (await heard()).stopped).toBe(1);
    await indicator(page).getByRole("button", { name: "Continuar a contagem" }).click();
    await expect.poll(async () => (await heard()).started).toBe(2);
  });

  test("silenciar vale dentro e fora do Modo foco", async ({ page, account }) => {
    void account;
    await listen(page);
    await openFocus(page);
    await page.getByRole("button", { name: "Chuva", exact: true }).click();
    await start(page).click();
    await page.getByRole("link", { name: "Minimizar" }).click();
    await expect(indicator(page)).toBeVisible();
    const width = page.viewportSize()!.width;
    test.skip(width >= 768 && width < 1024, "o trilho estreito não tem o botão de som");
    await indicator(page).getByRole("button", { name: "Silenciar o som" }).click();
    await indicator(page).getByRole("link", { name: "Voltar ao Modo foco" }).click();
    await expect(page.getByRole("button", { name: "Ativar o som" })).toBeVisible();
  });

  test("encerrar pergunta antes, não registra e tira o indicador", async ({ page, account }) => {
    await openFocus(page);
    await start(page).click();
    await page.getByRole("button", { name: "Encerrar", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Encerrar a sessão?" });
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Pausar", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Encerrar", exact: true }).click();
    await dialog.getByRole("button", { name: "Encerrar", exact: true }).click();
    await expect(page).toHaveURL(/\/inicio$/);
    await expect(indicator(page)).toHaveCount(0);
    expect(await savedSessions(account)).toEqual([]);
    await openFocus(page);
    await expect(page.getByRole("timer")).toHaveText("25:00");
  });

  test("se a sessão terminar durante a pergunta, ela conta", async ({ page, account }) => {
    await openFocus(page);
    await putEnding(page, account, 9);
    await openFocus(page);
    await page.getByRole("button", { name: "Encerrar", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Encerrar a sessão?" });
    await expect(dialog).toBeVisible();
    // The buttons don't touch the edge of the dialog.
    const [panel, button] = [await dialog.boundingBox(), await dialog.getByRole("button").last().boundingBox()];
    expect(panel!.y + panel!.height - button!.y - button!.height).toBeGreaterThanOrEqual(16);
    await expect(page.getByText("Sessão de foco concluída")).toBeVisible({ timeout: 15_000 });
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await savedSessions(account)).length).toBe(1);
    // Nor does the question come back in the next session.
    await page.getByRole("button", { name: "Pular para o foco" }).click();
    await start(page).click();
    await expect(page.getByRole("button", { name: "Pausar", exact: true })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(dialog).toBeHidden();
  });

  test("a pausa aparece no indicador: iniciar ou pular", async ({ page, account }) => {
    await openFocus(page);
    await putEnding(page, account, 6);
    await page.goto("/inicio");
    await expect(indicator(page)).toBeVisible();
    await expect(page.getByText("Sessão de foco concluída")).toBeVisible({ timeout: 15_000 });
    await expect(indicator(page).getByText("Pausa", { exact: true })).toBeVisible();
    await expect(indicator(page).getByRole("timer")).toHaveText("05:00");
    await indicator(page).getByRole("button", { name: "Iniciar a pausa" }).click();
    await expect.poll(() => seconds(page)).toBeLessThan(300);
    await indicator(page).getByRole("link", { name: "Voltar ao Modo foco" }).click();
    // Nothing is lost by ending a break: no question.
    await page.getByRole("button", { name: "Encerrar", exact: true }).click();
    await expect(page).toHaveURL(/\/inicio$/);
    await expect(indicator(page)).toHaveCount(0);

    await putEnding(page, account, 2);
    await page.reload();
    await indicator(page).getByRole("button", { name: "Pular a pausa" }).click({ timeout: 15_000 });
    await expect(indicator(page)).toHaveCount(0);
  });

  test("sair da conta para o som e tira o indicador", async ({ page, account }) => {
    void account;
    const heard = await listen(page);
    await openFocus(page);
    await page.getByRole("button", { name: "Deep Focus", exact: true }).click();
    await start(page).click();
    await expect.poll(async () => (await heard()).started, DOWNLOAD).toBe(1);
    await page.getByRole("link", { name: "Minimizar" }).click();
    await expect(indicator(page)).toBeVisible();
    // By the menu, without reloading: a reload would stop the sound by itself.
    if (page.viewportSize()!.width < 768) await page.getByRole("button", { name: "Mais", exact: true }).click();
    await page.locator('a[href="/perfil"]:visible').click();
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(page).toHaveURL(/\/entrar$/);
    await expect.poll(async () => (await heard()).stopped).toBe(1);
    await expect.poll(async () => (await heard()).closed).toBe(1);
    await expect(indicator(page)).toHaveCount(0);
  });

  test("cabe na tela, sem cobrir a navegação nem o fim da página", async ({ page, account }) => {
    void account;
    await openFocus(page);
    await start(page).click();
    // The focus screen's own header, with the two ways out.
    const header = await page.evaluate(describeHorizontalOverflow);
    expect(header.overflow, header.report).toBeLessThanOrEqual(0);
    await page.getByRole("link", { name: "Minimizar" }).click();
    await expect(indicator(page)).toHaveCount(1);
    const { overflow, report } = await page.evaluate(describeHorizontalOverflow);
    expect(overflow, report).toBeLessThanOrEqual(0);
    for (const button of await indicator(page).getByRole("button").all()) {
      const box = (await button.boundingBox())!;
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(40);
    }
    await expect(page.getByText("Próximas provas", { exact: true })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const boxes = await page.evaluate(() => {
      const visible = (selector: string) =>
        [...document.querySelectorAll(selector)].map((e) => e.getBoundingClientRect()).find((b) => b.width > 0)!;
      const cards = [...document.querySelectorAll("main section")].map((e) => e.getBoundingClientRect());
      return {
        indicator: visible("[data-focus-indicator]").toJSON(),
        nav: visible("nav[aria-label=Principal]").toJSON(),
        contentEnd: Math.max(...cards.map((b) => b.bottom)),
      };
    });
    if (page.viewportSize()!.width < 768) {
      expect(boxes.indicator.bottom).toBeLessThanOrEqual(boxes.nav.top);
      expect(boxes.contentEnd).toBeLessThanOrEqual(boxes.indicator.top);
    } else {
      expect(boxes.indicator.right).toBeLessThanOrEqual(boxes.nav.right);
      // The profile, at the end of the menu, isn't pushed out of the screen.
      const profile = (await page.locator('a[href="/perfil"]:visible').boundingBox())!;
      expect(profile.y + profile.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    }
  });
});
