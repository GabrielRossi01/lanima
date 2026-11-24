import type { Page } from "@playwright/test";
import { createAccount, seedSubject, signIn } from "./helpers/accounts";
import { expect, test } from "./helpers/fixtures";

// page.route() can't see requests made by the service worker, which handles the Supabase calls.
test.use({ serviceWorkers: "block" });

const SECRET = "Matéria Secreta";
const onDevice = (page: Page) =>
  page.evaluate((name) => Object.values({ ...localStorage }).some((value) => String(value).includes(name)), SECRET);

async function openAndWaitForCopy(page: Page) {
  await page.goto("/materias");
  await expect(page.getByRole("link", { name: new RegExp(SECRET) })).toBeVisible();
  await expect.poll(() => onDevice(page), { message: "cópia salva no aparelho" }).toBe(true);
}

/** Past the persister's 1 s throttle: a late write must not bring the data back. */
async function expectGoneForGood(page: Page) {
  expect(await onDevice(page)).toBe(false);
  await page.waitForTimeout(2500);
  expect(await onDevice(page), "regravado depois de apagado").toBe(false);
}

test.describe("Dados guardados no aparelho", () => {
  test.beforeEach(async ({ account }) => {
    await seedSubject(account, { name: SECRET, color: "rosa" });
  });

  test("Sair apaga na hora, sem esperar a rede", async ({ page }) => {
    await openAndWaitForCopy(page);
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/auth/v1/logout**", async (route) => {
      await held;
      await route.fallback();
    });
    await page.goto("/perfil");
    await page.getByRole("button", { name: "Sair" }).click();
    // The server hasn't answered yet: the app already left and the copy is already gone.
    await expect(page).toHaveURL(/\/entrar/);
    await expectGoneForGood(page);
    release();
    await expectGoneForGood(page);
  });

  test("sessão que termina sozinha também apaga", async ({ page, context }) => {
    await openAndWaitForCopy(page);
    await context.clearCookies();
    await page.goto("/inicio");
    await expect(page).toHaveURL(/\/entrar/);
    await expectGoneForGood(page);
  });

  test("outra conta no mesmo aparelho não herda os dados", async ({ page }) => {
    await openAndWaitForCopy(page);
    await signIn(page, await createAccount({ prefix: "outra", name: "Bia" }));
    await expect(page.getByRole("heading", { level: 1 })).toContainText(", Bia");
    await expectGoneForGood(page);
  });

  test("recarregar logado mantém a cópia", async ({ page }) => {
    await openAndWaitForCopy(page);
    await page.reload();
    await expect(page.getByRole("link", { name: new RegExp(SECRET) })).toBeVisible();
    await page.waitForTimeout(1500);
    expect(await onDevice(page)).toBe(true);
  });
});
