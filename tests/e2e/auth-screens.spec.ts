import { expect, test, type Page } from "@playwright/test";
import { createAccount, uniqueEmail } from "./helpers/accounts";
import { codeFrom, latestEmailTo } from "./helpers/mailpit";
import { describeHorizontalOverflow } from "./helpers/overflow";

// page.route() can't see requests made by the service worker, which handles the Supabase calls.
test.use({ serviceWorkers: "block" });

const SCREENS = [
  { path: "/entrar", title: "Entrar no Lanima" },
  { path: "/criar-conta", title: "Criar conta no Lanima" },
] as const;

/** Stands in for Supabase + the provider: records the request and sends the browser back. */
async function fakeProvider(page: Page, answer: Record<string, string>) {
  const requests: URL[] = [];
  await page.route("**/auth/v1/authorize**", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const back = new URL(url.searchParams.get("redirect_to")!);
    for (const [key, value] of Object.entries(answer)) back.searchParams.set(key, value);
    // A page that goes back, not a 302: WebKit can't fulfill a request with a redirect.
    await route.fulfill({
      contentType: "text/html",
      body: `<script>location.replace(${JSON.stringify(back.toString())})</script>`,
    });
  });
  return requests;
}

test.describe("Entrar e Criar conta", () => {
  for (const { path, title } of SCREENS) {
    test(`${path}: botões sociais, e-mail e sem rolagem horizontal`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByRole("button", { name: "Continuar com o Google" })).toBeEnabled();
      await expect(page.getByRole("button", { name: "Continuar com o Notion" })).toBeEnabled();
      await expect(page.getByRole("button", { name: /Apple/ })).toHaveCount(0);
      await expect(page.getByLabel("E-mail")).toBeVisible();
      const { overflow, report } = await page.evaluate(describeHorizontalOverflow);
      expect(overflow, `${path}: ${overflow}px de rolagem horizontal${report}`).toBeLessThanOrEqual(0);
    });
  }

  for (const scheme of ["light", "dark"] as const) {
    test(`as duas têm a mesma estrutura e as mesmas cores (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const look = async (path: string) => {
        await page.goto(path);
        await expect(page.getByRole("button", { name: "Continuar com o Notion" })).toBeVisible();
        return page.evaluate(() => {
          const pick = (el: Element | null) => {
            if (!el) return null;
            const s = getComputedStyle(el);
            const box = el.getBoundingClientRect();
            return [
              s.backgroundColor,
              s.color,
              s.borderColor,
              s.fontSize,
              Math.round(box.width),
              Math.round(box.height),
            ];
          };
          const buttons = [...document.querySelectorAll("form button")];
          return {
            theme: document.documentElement.getAttribute("data-theme"),
            body: pick(document.body)?.slice(0, 2),
            panel: pick(document.querySelector("aside")),
            title: pick(document.querySelector("h1"))?.slice(1, 4),
            input: pick(document.querySelector("form input")),
            buttons: buttons.map(pick),
          };
        });
      };
      const signIn = await look("/entrar");
      const signUp = await look("/criar-conta");
      expect(signIn.theme).toBe(scheme);
      expect(signIn.buttons).toHaveLength(3);
      expect(signUp).toEqual(signIn);
    });
  }

  test("e-mail sem conta não cria conta em Entrar; leva para Criar conta com o e-mail", async ({ page }) => {
    const email = uniqueEmail("nova");
    await page.goto("/entrar?proxima=%2Fperfil");
    await page.getByLabel("E-mail").fill(email);
    await page.getByRole("button", { name: "Receber link e código" }).click();
    const notice = page.getByText("Não achamos uma conta com esse e-mail");
    await expect(notice).toBeVisible();
    // Still none: the first try didn't create it.
    await page.getByLabel("E-mail").fill("");
    await expect(notice).toHaveCount(0);
    await page.getByLabel("E-mail").fill(email);
    await page.getByRole("button", { name: "Receber link e código" }).click();
    await expect(notice).toBeVisible();

    await page.getByRole("link", { name: "Criar conta com esse e-mail" }).click();
    await expect(page).toHaveURL(/\/criar-conta\?proxima=%2Fperfil$/);
    await expect(page.getByLabel("E-mail")).toHaveValue(email);
    const sentAfter = Date.now() - 1000;
    await page.getByRole("button", { name: "Criar conta com e-mail" }).click();
    await expect(page.getByRole("heading", { name: "Confira seu e-mail" })).toBeVisible();
    await page.getByLabel("Código do e-mail").fill(codeFrom(await latestEmailTo(email, sentAfter)));
    await page.getByRole("button", { name: "Criar conta", exact: true }).click();
    await expect(page).toHaveURL(/\/boas-vindas$/);
  });

  test("Criar conta com um e-mail que já tem conta entra nela", async ({ page }) => {
    const account = await createAccount({ prefix: "existe", name: "Bia" });
    await page.goto("/criar-conta");
    await page.getByLabel("E-mail").fill(account.email);
    const sentAfter = Date.now() - 1000;
    await page.getByRole("button", { name: "Criar conta com e-mail" }).click();
    await page.getByLabel("Código do e-mail").fill(codeFrom(await latestEmailTo(account.email, sentAfter)));
    await page.getByRole("button", { name: "Criar conta", exact: true }).click();
    await expect(page).toHaveURL(/\/inicio$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(", Bia");
  });

  test("os links entre as duas levam o e-mail e a tela pedida", async ({ page }) => {
    await page.goto("/entrar?proxima=%2Fmaterias");
    await page.getByLabel("E-mail").fill("ana@exemplo.com");
    await page.getByRole("link", { name: "Criar conta", exact: true }).click();
    await expect(page).toHaveURL(/\/criar-conta\?proxima=%2Fmaterias$/);
    await expect(page.getByLabel("E-mail")).toHaveValue("ana@exemplo.com");
    await page.getByRole("link", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/entrar\?proxima=%2Fmaterias$/);
  });
});

test.describe("Google e Notion", () => {
  for (const [provider, label, extra] of [
    ["google", "Google", ["prompt", "select_account"]],
    ["notion", "Notion", ["owner", "user"]],
  ] as const) {
    test(`${label}: pede ao provedor certo e, cancelado, volta com o aviso`, async ({ page }) => {
      const requests = await fakeProvider(page, { error: "access_denied", error_description: "cancelado" });
      await page.goto("/criar-conta?proxima=%2Fmaterias");
      await page.getByRole("button", { name: `Continuar com o ${label}` }).click();
      await expect(page).toHaveURL(
        new RegExp(`/criar-conta\\?erro=cancelado&provedor=${provider}&proxima=%2Fmaterias$`),
      );
      await expect(page.getByText(`A entrada com o ${label} foi cancelada.`)).toBeVisible();
      await expect(page.getByRole("button", { name: `Continuar com o ${label}` })).toBeEnabled();

      expect(requests).toHaveLength(1);
      const asked = requests[0].searchParams;
      expect(asked.get("provider")).toBe(provider);
      expect(asked.get(extra[0])).toBe(extra[1]);
      expect(asked.get("code_challenge")).toBeTruthy();
    });
  }

  test("código que não vale volta para Entrar com o aviso", async ({ page }) => {
    await fakeProvider(page, { code: "00000000-0000-4000-8000-000000000000" });
    await page.goto("/entrar");
    await page.getByRole("button", { name: "Continuar com o Google" }).click();
    await expect(page).toHaveURL(/\/entrar\?erro=social&provedor=google$/);
    await expect(page.getByText("Não foi possível entrar com o Google. Tente de novo.")).toBeVisible();
  });

  test("Notion sem e-mail explica o motivo", async ({ page }) => {
    await fakeProvider(page, {
      error: "server_error",
      error_description: "Error getting user email from external provider",
    });
    await page.goto("/entrar");
    await page.getByRole("button", { name: "Continuar com o Notion" }).click();
    await expect(page.getByText("O Notion não informou seu e-mail")).toBeVisible();
  });
});
