import type { Page } from "@playwright/test";
import { expect, test } from "./helpers/fixtures";

/** A short tone as WAV: the test browser has no AAC decoder, and the engine doesn't care. */
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

async function openFocus(page: Page) {
  await page.goto("/foco");
  await expect(page.locator("[data-focus-theme][data-ready]")).toBeVisible();
}
const sound = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const start = (page: Page) => page.getByRole("button", { name: "Iniciar", exact: true });

/** Records the media controls, which a test can't press from outside. */
async function captureMediaSession(page: Page) {
  await page.addInitScript(() => {
    const handlers: Record<string, (() => void) | null> = {};
    (window as unknown as { __media: typeof handlers }).__media = handlers;
    if (!("mediaSession" in navigator)) return;
    const original = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
    navigator.mediaSession.setActionHandler = (action, handler) => {
      handlers[action] = handler as (() => void) | null;
      original(action, handler);
    };
  });
}
const press = (page: Page, action: "play" | "pause") =>
  page.evaluate((name) => (window as unknown as { __media: Record<string, () => void> }).__media[name](), action);

test.describe("Som do modo foco", () => {
  // page.route() can't see what the service worker fetches.
  test.use({ serviceWorkers: "block" });

  test("toca com o cronômetro, para na pausa, e o Lo-fi mostra que está tocando", async ({ page, account }) => {
    void account;
    const asked: string[] = [];
    await page.route("**/sounds/**", async (route) => {
      asked.push(new URL(route.request().url()).pathname);
      await route.fulfill({ contentType: "audio/wav", body: tone() });
    });
    await openFocus(page);
    await sound(page, "Lo-fi").click();
    // Choosing isn't playing: nothing is downloaded before the session starts.
    await page.waitForTimeout(500);
    expect(asked).toEqual([]);

    await start(page).click();
    const label = page.getByText("Lo-fi · tocando agora");
    await expect(label).toBeVisible();
    expect(asked).toEqual(["/sounds/lofi.m4a"]);
    const bars = () => page.locator("[data-equalizer]").evaluate((el) => el.getAnimations({ subtree: true }).length);
    expect(await bars()).toBe(6);

    await page.getByRole("button", { name: "Pausar" }).click();
    await expect(label).toHaveCount(0);
    expect(await bars()).toBe(0);

    // Back on: it is already decoded.
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(label).toBeVisible();
    await sound(page, "Chuva").click();
    await expect.poll(() => asked).toEqual(["/sounds/lofi.m4a", "/sounds/chuva.m4a"]);
    await sound(page, "Silêncio").click();
    await page.waitForTimeout(300);
    expect(asked).toHaveLength(2);
  });

  test("controles da tela de bloqueio pausam e retomam a sessão", async ({ page, account }) => {
    void account;
    await captureMediaSession(page);
    await page.route("**/sounds/**", (route) => route.fulfill({ contentType: "audio/wav", body: tone() }));
    await openFocus(page);
    test.skip(!(await page.evaluate(() => "mediaSession" in navigator)), "sem Media Session neste navegador");
    await sound(page, "Deep Focus").click();
    await start(page).click();
    await expect.poll(() => page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe("Lanima · Deep Focus");
    expect(await page.evaluate(() => navigator.mediaSession.metadata!.artwork.length)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => navigator.mediaSession.playbackState)).toBe("playing");

    await press(page, "pause");
    await expect(page.getByRole("button", { name: "Continuar" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => navigator.mediaSession.playbackState)).toBe("paused");
    await press(page, "play");
    await expect(page.getByRole("button", { name: "Pausar" })).toBeVisible();
    await sound(page, "Silêncio").click();
    await expect.poll(() => page.evaluate(() => navigator.mediaSession.metadata)).toBeNull();
  });

  test("som que não carrega avisa, e o cronômetro continua", async ({ page, account }) => {
    void account;
    await page.route("**/sounds/**", (route) => route.fulfill({ status: 404, body: "" }));
    await openFocus(page);
    await sound(page, "Chuva").click();
    await start(page).click();
    await expect(page.getByText("Não foi possível tocar Chuva")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pausar" })).toBeVisible();
    await expect(page.getByRole("timer")).not.toHaveText("25:00");
  });

  test("silenciar e ativar", async ({ page, account }) => {
    void account;
    await openFocus(page);
    await expect(page.getByRole("button", { name: "Silenciar o som" })).toHaveCount(0);
    await sound(page, "Chuva").click();
    await page.getByRole("button", { name: "Silenciar o som" }).click();
    await page.getByRole("button", { name: "Ativar o som" }).click();
    await expect(page.getByRole("button", { name: "Silenciar o som" })).toBeVisible();
  });
});

test.describe("Sons no aparelho", () => {
  test("só baixa o som usado, e ele fica guardado", async ({ page, account }) => {
    void account;
    await openFocus(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    // Controlled by the worker from the first load on (clientsClaim), or after a reload.
    await page.reload();
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    await expect(page.locator("[data-focus-theme][data-ready]")).toBeVisible();
    const cached = () =>
      page.evaluate(async () => {
        const found: string[] = [];
        for (const name of await caches.keys()) {
          for (const request of await (await caches.open(name)).keys()) {
            const { pathname } = new URL(request.url);
            if (pathname.startsWith("/sounds/")) found.push(`${name} ${pathname}`);
          }
        }
        return found;
      });
    expect(await cached()).toEqual([]);
    await sound(page, "Chuva").click();
    await start(page).click();
    await expect.poll(cached).toEqual(["focus-sounds /sounds/chuva.m4a"]);
  });

  test("créditos na tela Sobre", async ({ page, account }) => {
    void account;
    await page.goto("/sobre");
    for (const text of ["Chuva: Rain pattering loop", "Lo-fi: Lofi music 001", "Deep Focus: Brown noise 15-00"]) {
      await expect(page.getByText(text)).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "página original" })).toHaveCount(3);
  });
});
