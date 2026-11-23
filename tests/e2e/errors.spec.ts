import { expect, test } from "@playwright/test";
import { createAccount, signIn } from "./helpers/accounts";

test.describe("Páginas de erro", () => {
  test("endereço que não existe mostra a página 404", async ({ page }) => {
    const response = await page.goto("/pagina-que-nao-existe");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Página não encontrada" })).toBeVisible();
    await page.getByRole("link", { name: "Voltar para o início" }).click();
    // Signed out: the start page sends her on to /entrar.
    await expect(page).toHaveURL(/\/entrar$/);
  });

  test.describe("perfil indisponível", () => {
    // page.route() can't see requests the service worker makes on the page's behalf (Playwright
    // limitation), and the worker handles Supabase calls. The worker isn't under test here.
    test.use({ serviceWorkers: "block" });

    test("perfil que não carrega mostra o erro com o código, sem ficar em loop", async ({ page }) => {
      // Reproduces the hosted project without the profiles table: PostgREST answers 404 · PGRST205.
      let profileRequests = 0;
      let broken = true;
      await page.route("**/rest/v1/profiles?**", async (route) => {
        if (route.request().method() !== "GET" || !broken) return route.fallback();
        profileRequests++;
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({
            code: "PGRST205",
            message: "Could not find the table 'public.profiles' in the schema cache",
            details: null,
            hint: null,
          }),
        });
      });

      const account = await createAccount({ prefix: "noprofile" });
      await signIn(page, account);
      await expect(page.getByRole("heading", { level: 1, name: "Não foi possível carregar seu perfil" })).toBeVisible();
      await expect(page.getByText("perfil: 404 · PGRST205")).toBeVisible();

      // Regression: the gate used to flip between the app and the splash, requesting the profile
      // over and over. Now it stays on the error screen.
      const settled = profileRequests;
      await page.waitForTimeout(3000);
      expect(profileRequests - settled, "pedidos do perfil depois da tela de erro").toBe(0);
      expect(profileRequests).toBeLessThanOrEqual(3);

      // Once the server answers again, "Tentar de novo" opens the app.
      broken = false;
      await page.getByRole("button", { name: "Tentar de novo" }).click();
      await expect(page.getByRole("heading", { level: 1 })).toContainText(", Maria");
    });
  });
});
