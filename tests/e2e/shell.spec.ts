import { expect, test, type Page } from "@playwright/test";

type Layout = "sidebar" | "rail" | "tabbar";

function layoutFor(width: number): Layout {
  if (width >= 1024) return "sidebar";
  if (width >= 768) return "rail";
  return "tabbar";
}

async function isIOSUserAgent(page: Page) {
  return /iPhone|iPad/.test(await page.evaluate(() => navigator.userAgent));
}

function currentLayout(page: Page): Layout {
  return layoutFor(page.viewportSize()!.width);
}

/** The visible "Principal" nav (the other two are display:none at this width). */
function mainNav(page: Page) {
  return page.getByRole("navigation", { name: "Principal" });
}

test.describe("AppShell responsivo", () => {
  test("mostra a navegação certa para a largura da tela", async ({ page }) => {
    await page.goto("/inicio");
    const nav = mainNav(page);
    await expect(nav).toHaveCount(1);
    const layout = currentLayout(page);

    if (layout === "sidebar") {
      await expect(nav.getByRole("link", { name: "Resumos e testes" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Grupo e ranking" })).toBeVisible();
      await expect(nav).toHaveCSS("width", "248px");
    } else if (layout === "rail") {
      await expect(nav).toHaveCSS("width", "72px");
      await expect(nav.getByRole("button", { name: "Abrir menu" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Resumos e testes" })).toBeVisible();
    } else {
      for (const label of ["Início", "Matérias", "Foco", "Ranking"]) {
        await expect(nav.getByRole("link", { name: label })).toBeVisible();
      }
      await expect(nav.getByRole("button", { name: "Mais" })).toBeVisible();
    }
  });

  test("navega e marca o item ativo", async ({ page }) => {
    await page.goto("/inicio");
    const nav = mainNav(page);
    await expect(nav.getByRole("link", { name: "Início" })).toHaveAttribute("aria-current", "page");
    await nav.getByRole("link", { name: "Matérias" }).click();
    await expect(page).toHaveURL(/\/materias$/);
    await expect(page.getByRole("heading", { level: 1, name: "Matérias" })).toBeVisible();
    await expect(mainNav(page).getByRole("link", { name: "Matérias" })).toHaveAttribute("aria-current", "page");
  });

  test("telas que não cabem na barra inferior ficam acessíveis", async ({ page }) => {
    await page.goto("/inicio");
    const layout = currentLayout(page);
    test.skip(layout === "sidebar", "No menu lateral tudo já está visível.");

    if (layout === "tabbar") {
      await mainNav(page).getByRole("button", { name: "Mais" }).click();
      const sheet = page.getByRole("dialog", { name: "Mais" });
      await expect(sheet).toBeVisible();
      await sheet.getByRole("link", { name: "Arquivos" }).click();
    } else {
      await mainNav(page).getByRole("button", { name: "Abrir menu" }).click();
      const drawer = page.getByRole("dialog", { name: "Menu" });
      await expect(drawer).toBeVisible();
      await drawer.getByRole("link", { name: "Arquivos" }).click();
    }
    await expect(page).toHaveURL(/\/arquivos$/);
    await expect(page.getByRole("heading", { level: 1, name: "Arquivos" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("Esc fecha a folha e devolve o foco", async ({ page }) => {
    await page.goto("/inicio");
    const layout = currentLayout(page);
    test.skip(layout === "sidebar", "Sem folha de navegação no menu lateral.");
    const trigger =
      layout === "tabbar"
        ? mainNav(page).getByRole("button", { name: "Mais" })
        : mainNav(page).getByRole("button", { name: "Abrir menu" });
    await trigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("não tem rolagem horizontal", async ({ page }) => {
    for (const path of ["/inicio", "/perfil", "/design"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test("alvos de toque da navegação têm pelo menos 44 px", async ({ page }) => {
    await page.goto("/inicio");
    const targets = mainNav(page).locator("a, button");
    const count = await targets.count();
    expect(count).toBeGreaterThan(3);
    for (let i = 0; i < count; i++) {
      const target = targets.nth(i);
      if (!(await target.isVisible())) continue;
      const box = (await target.boundingBox())!;
      expect(box.height, await target.innerText()).toBeGreaterThanOrEqual(44);
      expect(box.width, await target.innerText()).toBeGreaterThanOrEqual(44);
    }
  });

  test("modo foco abre em tela cheia, sem menu", async ({ page }) => {
    await page.goto("/foco");
    await expect(page.getByRole("navigation", { name: "Principal" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Sair do foco" })).toBeVisible();
  });
});

test.describe("Tema", () => {
  /** Records the theme at the moment <body> is inserted, i.e. before the first paint. */
  async function captureThemeAtFirstPaint(page: Page, stored: string | null) {
    await page.addInitScript((value) => {
      if (value) localStorage.setItem("lanima:theme", value);
      new MutationObserver((_records, observer) => {
        if (document.body) {
          (window as unknown as { __themeAtBody: string | null }).__themeAtBody =
            document.documentElement.getAttribute("data-theme");
          observer.disconnect();
        }
      }).observe(document, { childList: true, subtree: true });
    }, stored);
  }

  test("tema escuro salvo é aplicado antes da primeira pintura (sem piscar)", async ({ page }) => {
    await captureThemeAtFirstPaint(page, "dark");
    await page.goto("/inicio");
    expect(await page.evaluate(() => (window as unknown as { __themeAtBody: string }).__themeAtBody)).toBe("dark");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(18, 24, 29)");
    for (const meta of await page.locator('meta[name="theme-color"]').all()) {
      await expect(meta).toHaveAttribute("content", "#12181D");
    }
  });

  test("automático segue o sistema", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await captureThemeAtFirstPaint(page, null);
    await page.goto("/inicio");
    expect(await page.evaluate(() => (window as unknown as { __themeAtBody: string }).__themeAtBody)).toBe("dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("a escolha no Perfil vale na hora e depois de recarregar", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/perfil");
    await page.getByRole("radio", { name: "Escuro" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(18, 24, 29)");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("radio", { name: "Escuro" })).toHaveAttribute("aria-checked", "true");
  });
});

test.describe("PWA", () => {
  test("manifest instalável", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBe(true);
    const manifest = await res.json();
    expect(manifest).toMatchObject({
      name: "Lanima",
      short_name: "Lanima",
      display: "standalone",
      theme_color: "#F5F6F5",
      background_color: "#F5F6F5",
    });
    const maskable = manifest.icons.filter((i: { purpose: string }) => i.purpose === "maskable");
    expect(maskable.map((i: { sizes: string }) => i.sizes).sort()).toEqual(["192x192", "512x512"]);
    for (const icon of manifest.icons) expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
    expect((await request.get("/icons/apple-touch-icon.png")).ok()).toBe(true);
  });

  test("service worker registra com escopo da raiz", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Registro de service worker verificado no Chromium (Galaxy Tab).");
    await page.goto("/inicio");
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(new URL(scope).pathname).toBe("/");
  });

  test("Android: botão “Instalar o Lanima” usa o prompt nativo", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "beforeinstallprompt só existe no Chromium.");
    await page.goto("/inicio");
    test.skip(await isIOSUserAgent(page), "No iOS não existe prompt nativo.");
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & Record<string, unknown>;
      event.prompt = () => {
        (window as unknown as { __prompted: boolean }).__prompted = true;
        return Promise.resolve();
      };
      event.userChoice = Promise.resolve({ outcome: "accepted", platform: "web" });
      window.dispatchEvent(event);
    });
    const layout = currentLayout(page);
    if (layout === "tabbar") await mainNav(page).getByRole("button", { name: "Mais" }).click();
    const scope = layout === "tabbar" ? page.getByRole("dialog", { name: "Mais" }) : mainNav(page);
    await scope.getByRole("button", { name: "Instalar o Lanima" }).click();
    expect(await page.evaluate(() => (window as unknown as { __prompted?: boolean }).__prompted)).toBe(true);
    await expect(page.getByText("Lanima instalado")).toBeVisible();
  });

  test("iOS: folha com o passo a passo de instalação", async ({ page }) => {
    await page.goto("/inicio");
    test.skip(!(await isIOSUserAgent(page)), "Fluxo do Safari no iPhone e no iPad.");
    const layout = currentLayout(page);
    if (layout === "tabbar") await mainNav(page).getByRole("button", { name: "Mais" }).click();
    const scope = layout === "tabbar" ? page.getByRole("dialog", { name: "Mais" }) : mainNav(page);
    await scope.getByRole("button", { name: "Instalar o Lanima" }).click();
    const sheet = page.getByRole("dialog", { name: "Instalar o Lanima" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText("Adicionar à Tela de Início")).toBeVisible();
    await sheet.getByRole("button", { name: "Entendi" }).click();
    await expect(sheet).toHaveCount(0);
  });

  test("já instalado (standalone), não oferece instalação", async ({ page }) => {
    await page.addInitScript(() => {
      const original = window.matchMedia.bind(window);
      window.matchMedia = (query: string) =>
        query.includes("display-mode: standalone")
          ? ({
              matches: true,
              media: query,
              addEventListener() {},
              removeEventListener() {},
            } as unknown as MediaQueryList)
          : original(query);
    });
    await page.goto("/inicio");
    await expect(page.getByRole("button", { name: "Instalar o Lanima" })).toHaveCount(0);
  });
});

test.describe("/design", () => {
  test("mostra os componentes nos dois temas", async ({ page }) => {
    await page.goto("/design");
    await expect(page.getByRole("heading", { level: 1, name: "Sistema visual" })).toBeVisible();
    await expect(page.locator('[data-theme="light"]').getByRole("heading", { name: "Tema claro" })).toBeAttached();
    await expect(page.locator('[data-theme="dark"]').getByRole("heading", { name: "Tema escuro" })).toBeAttached();
    const darkSurface = page.locator('[data-theme="dark"]').first();
    await expect(darkSurface).toHaveCSS("background-color", "rgb(18, 24, 29)");
  });
});
