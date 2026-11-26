import type { Page } from "@playwright/test";
import { adminClient, createAccount, signIn, type TestAccount } from "./helpers/accounts";
import { expect, test } from "./helpers/fixtures";

// page.route() can't see requests made by the service worker, which handles the Supabase calls.
test.use({ serviceWorkers: "block", colorScheme: "light" });

const PROFILES = "**/rest/v1/profiles**";
const html = (page: Page) => page.locator("html");

async function savedTheme(account: TestAccount) {
  const { data } = await adminClient().from("profiles").select("theme").eq("id", account.id).single();
  return data?.theme;
}

/** Answers every save of the profile with `handle`; everything else goes through. */
async function onSave(page: Page, handle: "hold" | "fail") {
  let saves = 0;
  let active = true;
  await page.route(PROFILES, async (route) => {
    if (!active || route.request().method() !== "PATCH") return route.fallback();
    saves++;
    // "hold": never answered, like a slow network (or none) until the page goes away.
    if (handle === "fail") await route.fulfill({ status: 500, json: { code: "XX000", message: "falhou" } });
  });
  return {
    saves: () => saves,
    /** From now on saves go through. Not unroute(): that would let the held ones reach the server. */
    stop: () => {
      active = false;
    },
  };
}

test.describe("Tema guardado na conta", () => {
  test("recarregar antes de o servidor salvar não perde a escolha", async ({ page, account }) => {
    const { saves, stop } = await onSave(page, "hold");
    await page.goto("/perfil");
    await page.getByRole("radio", { name: "Escuro" }).click();
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
    await expect.poll(saves).toBe(1);
    stop();
    await page.reload();
    await expect(page.getByRole("radio", { name: "Escuro" })).toHaveAttribute("aria-checked", "true");
    await expect.poll(() => savedTheme(account), { message: "enviado depois de recarregar" }).toBe("dark");
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
  });

  test("sair da tela antes de o servidor salvar também não perde", async ({ page, account }) => {
    const { saves, stop } = await onSave(page, "hold");
    await page.goto("/perfil");
    await page.getByRole("radio", { name: "Escuro" }).click();
    await expect.poll(saves).toBe(1);
    await page.goto("/inicio");
    stop();
    await page.goto("/perfil");
    await expect(page.getByRole("radio", { name: "Escuro" })).toHaveAttribute("aria-checked", "true");
    await expect.poll(() => savedTheme(account)).toBe("dark");
  });

  test("servidor recusando: mantém no aparelho e não fica tentando sem parar", async ({ page, account }) => {
    void account;
    const { saves } = await onSave(page, "fail");
    await page.goto("/perfil");
    await page.getByRole("radio", { name: "Escuro" }).click();
    await expect.poll(saves).toBe(1);
    await page.waitForTimeout(2000);
    expect(saves()).toBe(1);
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
  });

  test("a escolha pendente de uma conta não vai para outra", async ({ page, account }) => {
    void account;
    const { saves, stop } = await onSave(page, "hold");
    await page.goto("/perfil");
    await page.getByRole("radio", { name: "Escuro" }).click();
    await expect.poll(saves).toBe(1);
    stop();

    const other = await createAccount({ prefix: "tema", name: "Bia" });
    await signIn(page, other);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(", Bia");
    await expect(html(page)).toHaveAttribute("data-theme-preference", "system");
    expect(await savedTheme(other)).toBe("system");
  });
});

test.describe("Tema no cadastro", () => {
  test.use({ colorScheme: "dark" });

  test("a conta nova fica com o tema que já está no aparelho", async ({ page }) => {
    await page.goto("/entrar");
    await page.evaluate(() => localStorage.setItem("lanima:theme", "light"));
    await page.reload();
    await expect(html(page)).toHaveAttribute("data-theme", "light");

    const fresh = await createAccount({ prefix: "tema", onboarded: false });
    expect(await savedTheme(fresh)).toBe("system");
    await signIn(page, fresh, "/boas-vindas");
    await expect(page.getByRole("button", { name: "Começar" })).toBeVisible();
    await expect.poll(() => savedTheme(fresh), { message: "salvo na conta nova" }).toBe("light");
    await expect(html(page)).toHaveAttribute("data-theme", "light");
    await page.reload();
    await expect(page.getByRole("button", { name: "Começar" })).toBeVisible();
    await expect(html(page)).toHaveAttribute("data-theme", "light");
  });
});
