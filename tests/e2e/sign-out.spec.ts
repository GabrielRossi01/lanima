import type { BrowserContext, Page } from "@playwright/test";
import { signIn } from "./helpers/accounts";
import { expect, test } from "./helpers/fixtures";

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

test.describe("Sair só deste aparelho", () => {
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
