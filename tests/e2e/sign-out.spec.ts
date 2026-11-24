import type { BrowserContext, Page } from "@playwright/test";
import { createAccount, signIn } from "./helpers/accounts";
import { expect, test } from "./helpers/fixtures";
import { codeFrom, latestEmailTo } from "./helpers/mailpit";

// page.route() can't see requests made by the service worker, which handles the Supabase calls.
test.use({ serviceWorkers: "block" });

/**
 * Makes the access token look expired, so the next request must use the refresh token. A revoked
 * session only shows then: until it expires, the access token is accepted anyway.
 */
async function expireAccessToken(context: BrowserContext) {
  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name.endsWith("-auth-token"));
  if (!session) throw new Error("Cookie da sessão não encontrado.");
  const value = JSON.parse(Buffer.from(decodeURIComponent(session.value).slice(7), "base64url").toString("utf8"));
  value.expires_at = 1;
  await context.addCookies([
    { ...session, value: "base64-" + Buffer.from(JSON.stringify(value)).toString("base64url") },
  ]);
}

async function signOutFromProfile(page: Page) {
  await page.goto("/perfil");
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/entrar/);
}

/** Holds the server's answer to the sign-out until released; resolves once the page got it. */
async function holdLogout(page: Page) {
  let open = () => {};
  const held = new Promise<void>((resolve) => (open = resolve));
  await page.route("**/auth/v1/logout**", async (route) => {
    await held;
    await route.fallback();
  });
  return async () => {
    const answered = page.waitForEvent("requestfinished", (r) => r.url().includes("/auth/v1/logout"));
    open();
    await answered;
    // Whatever the answer triggers (it used to navigate and erase) has had time to happen.
    await page.waitForTimeout(1500);
  };
}

test.describe("Sair só deste aparelho", () => {
  test("vai uma vez só para a tela de entrar, sem esperar o servidor", async ({ page, account }) => {
    void account;
    const release = await holdLogout(page);
    await page.goto("/perfil");
    const visits: string[] = [];
    page.on("framenavigated", (frame) => visits.push(new URL(frame.url()).pathname + new URL(frame.url()).search));
    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Entrar no Lanima" })).toBeVisible();
    await expect(page).toHaveURL(/\/entrar$/);
    await release();
    // WebKit also reports the page she was already on (3 of 3 profiles in CI): staying isn't a visit.
    expect(visits.filter((path) => path !== "/perfil")).toEqual(["/entrar"]);
  });

  test("a resposta atrasada não atrapalha quem entrou em seguida", async ({ page, account }) => {
    void account;
    const release = await holdLogout(page);
    await page.goto("/perfil");
    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Entrar no Lanima" })).toBeVisible();

    // Another person signs in without reloading the page and starts the onboarding.
    const next = await createAccount({ prefix: "seguinte", onboarded: false });
    const sentAfter = Date.now() - 1000;
    await page.getByLabel("E-mail").fill(next.email);
    await page.getByRole("button", { name: "Receber link e código" }).click();
    await page.getByLabel("Código do e-mail").fill(codeFrom(await latestEmailTo(next.email, sentAfter)));
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/boas-vindas$/);
    await page.getByRole("button", { name: "Começar" }).click();
    const name = page.getByLabel("Como prefere que te chamem?");
    await name.fill("Bia");

    await release();
    await expect(page).toHaveURL(/\/boas-vindas$/);
    await expect(name).toHaveValue("Bia");
    const lastUser = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    expect(lastUser, "a conta nova continua guardada no aparelho").toContain(next.id);
  });

  test("o outro aparelho continua logado, mesmo depois de renovar a sessão", async ({ page, account, browser }) => {
    const other = await browser.newContext({ serviceWorkers: "block" });
    const otherPage = await other.newPage();
    await signIn(otherPage, account);
    await signOutFromProfile(page);

    await expireAccessToken(other);
    await otherPage.goto("/perfil");
    await expect(otherPage.getByLabel("Nome")).toHaveValue(account.name);
    await expect(otherPage).toHaveURL(/\/perfil$/);
    await other.close();

    // And this device really is signed out.
    await page.goto("/inicio");
    await expect(page).toHaveURL(/\/entrar/);
  });

  test("sem conseguir falar com o servidor, sai mesmo assim", async ({ page, account }) => {
    void account;
    await page.route("**/auth/v1/logout**", (route) => route.abort());
    await signOutFromProfile(page);
    await page.goto("/inicio");
    await expect(page).toHaveURL(/\/entrar/);
    await expect(page.getByRole("heading", { level: 1, name: "Entrar no Lanima" })).toBeVisible();
  });
});
