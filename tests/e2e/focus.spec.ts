import type { Page } from "@playwright/test";
import { adminClient, seedSubject, seedTopics, type TestAccount } from "./helpers/accounts";
import { expect, test } from "./helpers/fixtures";
import { describeHorizontalOverflow } from "./helpers/overflow";

const SOUNDS = ["Chuva", "Lo-fi", "Deep Focus", "Silêncio"] as const;

async function openFocus(page: Page, query = "") {
  await page.goto(`/foco${query}`);
  await expect(page.locator("[data-focus-theme][data-ready]")).toBeVisible();
}

const sound = (page: Page, name: (typeof SOUNDS)[number]) => page.getByRole("button", { name, exact: true });

/** Seconds left, as shown. */
async function shown(page: Page): Promise<number> {
  const [min, sec] = (await page.getByRole("timer").innerText()).split(":").map(Number);
  return min * 60 + sec;
}

async function savedSound(account: TestAccount) {
  const { data } = await adminClient()
    .from("profiles")
    .select("focus_sound, focus_volume, focus_animation, focus_breath_text")
    .eq("id", account.id)
    .single();
  return data;
}

test.describe("Modo foco", () => {
  test("cronômetro: iniciar, pausar, continuar e reiniciar", async ({ page, account }) => {
    void account;
    await openFocus(page);
    await expect(page.getByRole("timer")).toHaveText("25:00");
    await page.getByRole("button", { name: "Iniciar", exact: true }).click();
    await expect.poll(() => shown(page)).toBeLessThan(25 * 60 - 1);

    await page.getByRole("button", { name: "Pausar" }).click();
    const paused = await shown(page);
    await page.waitForTimeout(2500);
    expect(await shown(page)).toBe(paused);

    await page.getByRole("button", { name: "Continuar" }).click();
    // The pause doesn't count: it goes on from where it was.
    expect(Math.abs((await shown(page)) - paused)).toBeLessThanOrEqual(1);
    await expect.poll(() => shown(page)).toBeLessThan(paused);
    await page.getByRole("button", { name: "Reiniciar" }).click();
    await expect(page.getByRole("timer")).toHaveText("25:00");
  });

  test("predefinições, personalizar e pular para a pausa", async ({ page, account }) => {
    void account;
    await openFocus(page);
    await page.getByRole("button", { name: "50 / 10 min" }).click();
    await expect(page.getByRole("timer")).toHaveText("50:00");
    await page.getByRole("button", { name: "Pular para a pausa" }).click();
    await expect(page.getByText("Sessão 1 de 4 · pausa")).toBeVisible();
    await expect(page.getByRole("timer")).toHaveText("10:00");
    await page.getByRole("button", { name: "Pular para o foco" }).click();
    await expect(page.getByText("Sessão 2 de 4 · foco")).toBeVisible();

    await page.getByRole("button", { name: "Personalizar" }).click();
    const sheet = page.getByRole("dialog", { name: "Personalizar a sessão" });
    await sheet.getByLabel(/^Foco/).fill("40");
    await sheet.getByRole("button", { name: "Usar" }).click();
    await expect(page.getByRole("timer")).toHaveText("40:00");
    await page.getByRole("button", { name: "Iniciar", exact: true }).click();
    await expect(page.getByRole("button", { name: "25 / 5 min" })).toBeDisabled();
  });

  test("fechar e voltar mostra o tempo certo", async ({ page, account }) => {
    void account;
    await openFocus(page);
    await page.getByRole("button", { name: "Iniciar", exact: true }).click();
    const startedAt = Date.now();
    await expect.poll(() => shown(page)).toBeLessThan(25 * 60);
    await page.goto("/inicio");
    await page.waitForTimeout(3000);
    await openFocus(page);
    await expect(page.getByRole("button", { name: "Pausar" })).toBeVisible();
    const expected = 25 * 60 - (Date.now() - startedAt) / 1000;
    expect(Math.abs((await shown(page)) - expected)).toBeLessThanOrEqual(2);
  });

  test("no fim, avisa e passa para a pausa", async ({ page, account }) => {
    void account;
    await openFocus(page);
    await page.getByRole("button", { name: "Iniciar", exact: true }).click();
    await expect(page.getByRole("button", { name: "Pausar" })).toBeVisible();
    // 26 minutes go by on the device's clock, as with the screen off.
    await page.evaluate(() => {
      const now = Date.now;
      Date.now = () => now() + 26 * 60_000;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.getByText("Sessão de foco concluída")).toBeVisible();
    await expect(page.getByText("Sessão 1 de 4 · pausa")).toBeVisible();
    await expect(page.getByRole("timer")).toHaveText("05:00");
  });

  test("matéria e tópico, vindos da página da matéria", async ({ page, account }) => {
    const subject = await seedSubject(account, { name: "Bioquímica", color: "rosa", icon: "flask-conical" });
    await seedTopics(account, subject.id, ["Enzimas", "Aminoácidos"]);
    await openFocus(page, `?materia=${subject.id}`);
    await page.getByRole("button", { name: "Bioquímica", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "O que você vai estudar?" });
    await sheet.getByRole("button", { name: "Enzimas" }).click();
    await expect(page.getByRole("button", { name: "Bioquímica · Enzimas" })).toBeVisible();
    await openFocus(page);
    await expect(page.getByRole("button", { name: "Bioquímica · Enzimas" })).toBeVisible();
  });
});

test.describe("Sons e temas", () => {
  test("trocar de som com o timer rodando não mexe no tempo", async ({ page, account }) => {
    void account;
    await openFocus(page);
    await page.getByRole("button", { name: "Iniciar", exact: true }).click();
    await expect.poll(() => shown(page)).toBeLessThan(25 * 60);
    const from = { at: Date.now(), left: await shown(page) };
    for (const name of ["Chuva", "Lo-fi", "Deep Focus", "Silêncio", "Chuva"] as const) {
      await sound(page, name).click();
      await expect(sound(page, name)).toHaveAttribute("aria-pressed", "true");
      await page.waitForTimeout(700);
      const expected = from.left - (Date.now() - from.at) / 1000;
      expect(Math.abs((await shown(page)) - expected), name).toBeLessThanOrEqual(1.5);
      await expect(page.getByRole("button", { name: "Pausar" })).toBeVisible();
      await expect(page.getByText("Sessão 1 de 4 · foco")).toBeVisible();
    }
    // Only the theme that came in is left after the crossfade.
    await expect(page.locator("[data-focus-backdrop]")).toHaveCount(1);
    await expect(page.locator('[data-focus-backdrop="chuva"]')).toBeVisible();
  });

  test("som, volume, animação e texto ficam salvos na conta", async ({ page, account }) => {
    await openFocus(page);
    await sound(page, "Lo-fi").click();
    await page.getByLabel("Volume").fill("35");
    await page.getByRole("switch", { name: "Animação do fundo" }).click();
    await page.getByRole("button", { name: "Ajustes do modo foco" }).click();
    await page.getByRole("switch", { name: /Texto de respiração/ }).click();
    await page.keyboard.press("Escape");
    await expect
      .poll(() => savedSound(account))
      .toEqual({ focus_sound: "lofi", focus_volume: 35, focus_animation: false, focus_breath_text: false });

    await openFocus(page);
    await expect(page.locator('[data-focus-theme="lofi"]')).toBeVisible();
    await expect(page.getByLabel("Volume")).toHaveValue("35");
    await expect(page.getByRole("switch", { name: "Animação do fundo" })).toHaveAttribute("aria-checked", "false");
  });

  test("sem rolagem horizontal e com alvos de 44 px em todos os temas", async ({ page, account }) => {
    void account;
    await openFocus(page);
    for (const name of SOUNDS) {
      await sound(page, name).click();
      await expect(page.locator("[data-focus-backdrop]")).toHaveCount(1);
      const { overflow, report } = await page.evaluate(describeHorizontalOverflow);
      expect(overflow, `${name}: ${overflow}px de rolagem horizontal${report}`).toBeLessThanOrEqual(0);
      const small = await page.locator("[data-focus-theme]").evaluate((root) =>
        [...root.querySelectorAll("a, button, input")]
          .filter((el) => !el.closest("dialog"))
          .map((el) => ({ el, box: el.getBoundingClientRect() }))
          .filter(({ box }) => box.height < 44 || box.width < 44)
          .map(({ el, box }) => `${el.getAttribute("aria-label") ?? el.textContent} ${box.width}×${box.height}`),
      );
      expect(small, name).toEqual([]);
    }
  });

  test("os sons e o interruptor funcionam pelo teclado", async ({ page, account }) => {
    void account;
    await openFocus(page);
    await sound(page, "Deep Focus").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-focus-theme="deep"]')).toBeVisible();
    const toggle = page.getByRole("switch", { name: "Animação do fundo" });
    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  test("sair apaga o cronômetro e as preferências do aparelho", async ({ page, account }) => {
    void account;
    await openFocus(page);
    await page.getByRole("button", { name: "Iniciar", exact: true }).click();
    await sound(page, "Chuva").click();
    const rows = () =>
      page.evaluate(
        () =>
          new Promise<number>((resolve, reject) => {
            const open = indexedDB.open("lanima");
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
              const names = [...open.result.objectStoreNames];
              const tx = open.result.transaction(names, "readonly");
              const counts = names.map((name) => tx.objectStore(name).count());
              tx.oncomplete = () => {
                open.result.close();
                resolve(counts.reduce((sum, c) => sum + c.result, 0));
              };
            };
          }),
      );
    await expect.poll(rows).toBeGreaterThan(0);
    await page.goto("/perfil");
    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/entrar/);
    await expect.poll(rows).toBe(0);
  });
});
