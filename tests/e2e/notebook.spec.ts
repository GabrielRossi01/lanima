import type { Locator } from "@playwright/test";
import { seedSubject } from "./helpers/accounts";
import { expect, test } from "./helpers/fixtures";
import { lineStroke, notebooksOf, seedNotebook } from "./helpers/notebook";

// Phase 7, part 2: the notebook list (Caderno), creating and organizing notebooks, and the Matéria.

/**
 * A thumbnail's pixels: painted (the page was drawn; it is drawn only once near the screen) and
 * ink among them (dark enough), drawn from the real strokes.
 */
async function thumbnailPixels(canvas: Locator): Promise<{ painted: number; ink: number }> {
  await canvas.scrollIntoViewIfNeeded();
  return canvas.evaluate((node) => {
    const c = node as HTMLCanvasElement;
    const data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let painted = 0;
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      painted++;
      if (data[i] + data[i + 1] + data[i + 2] < 300) ink++;
    }
    return { painted, ink };
  });
}

test.describe("Caderno: lista", () => {
  test("cria um caderno: abre a página e ele chega ao servidor", async ({ page, account }) => {
    await page.goto("/caderno");
    await expect(page.getByRole("heading", { name: "Nenhum caderno ainda" })).toBeVisible();
    await page.getByRole("button", { name: "Novo caderno" }).first().click();
    const sheet = page.getByRole("dialog", { name: "Novo caderno" });
    await sheet.getByRole("button", { name: "Criar e abrir" }).click();
    await expect(sheet.getByText("Dê um título ao caderno.")).toBeVisible();
    await sheet.getByLabel("Título").fill("Aula 08 · Tecido ósseo");
    await expect(sheet.getByRole("radio", { name: "Sem matéria" })).toHaveAttribute("aria-checked", "true");
    await sheet.getByRole("radio", { name: "Pautado" }).click();
    await sheet.getByRole("button", { name: "Criar e abrir" }).click();

    await expect(page).toHaveURL(/\/caderno\/editar\?pagina=[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: "Aula 08 · Tecido ósseo" })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Página 1 de 1");
    await expect
      .poll(async () => (await notebooksOf(account)).map((n) => [n.title, n.notebook_pages.map((p) => p.background)]), {
        timeout: 15_000,
      })
      .toEqual([["Aula 08 · Tecido ósseo", ["pautado"]]]);
    await expect(page.getByRole("status")).toContainText("Salvo");

    await page.getByRole("button", { name: "Adicionar página" }).click();
    await expect(page.getByRole("status")).toContainText("Página 2 de 2");
    await expect.poll(async () => (await notebooksOf(account))[0]?.notebook_pages.length, { timeout: 15_000 }).toBe(2);

    await page.getByRole("button", { name: "Caderno" }).click();
    await expect(page).toHaveURL(/\/caderno$/);
    await expect(page.getByRole("region", { name: "Continuar de onde parou" })).toContainText("página 2 de 2");
    await expect(page.getByRole("article")).toContainText("2 páginas");
  });

  test("cadernos de outro aparelho aparecem por matéria, com a miniatura desenhada", async ({ page, account }) => {
    const anatomia = await seedSubject(account, { name: "Anatomia", color: "celeste" });
    const bio = await seedSubject(account, { name: "Bioquímica", color: "rosa" });
    await seedNotebook(account, {
      title: "Sistema esquelético",
      subjectId: anatomia.id,
      pages: [{ strokes: [lineStroke("a", 120), lineStroke("b", 200)] }, {}],
      editedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
    });
    await seedNotebook(account, {
      title: "Enzimas",
      subjectId: bio.id,
      editedAt: new Date(Date.now() - 86_400_000 * 3).toISOString(),
    });
    await seedNotebook(account, { title: "Rascunhos", editedAt: new Date(Date.now() - 86_400_000 * 10).toISOString() });

    await page.goto("/caderno");
    for (const name of ["Anatomia", "Bioquímica", "Sem matéria"])
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
    const card = page.getByRole("article").filter({ hasText: "Sistema esquelético" });
    await expect(card).toContainText("2 páginas · há 3 min");
    await expect(page.getByRole("article").filter({ hasText: "Enzimas" })).toContainText("há 3 dias");
    await expect(page.getByRole("region", { name: "Continuar de onde parou" })).toContainText("Sistema esquelético");

    // The thumbnail is drawn from the strokes; an empty page has no ink.
    await expect.poll(async () => (await thumbnailPixels(card.getByTestId("miniatura"))).ink).toBeGreaterThan(50);
    const empty = page.getByRole("article").filter({ hasText: "Rascunhos" }).getByTestId("miniatura");
    await expect.poll(async () => (await thumbnailPixels(empty)).painted).toBeGreaterThan(1000);
    expect((await thumbnailPixels(empty)).ink).toBe(0);

    await page
      .getByRole("group", { name: "Filtrar por matéria" })
      .getByRole("button", { name: /Bioquímica/ })
      .click();
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByRole("article")).toContainText("Enzimas");
  });

  test("renomear, mudar de matéria e excluir pelo menu, também no servidor", async ({ page, account }) => {
    const anatomia = await seedSubject(account, { name: "Anatomia", color: "celeste" });
    await seedNotebook(account, { title: "Aula 7" });
    await page.goto("/caderno");

    await page.getByRole("button", { name: "Opções de Aula 7" }).click();
    await page
      .getByRole("dialog", { name: "Aula 7" })
      .getByRole("button", { name: "Renomear ou mudar de matéria" })
      .click();
    const sheet = page.getByRole("dialog", { name: "Editar caderno" });
    await sheet.getByLabel("Título").fill("Aula 07 · Esqueleto");
    await sheet.getByRole("radio", { name: "Anatomia" }).click();
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Anatomia" })).toBeVisible();
    await expect
      .poll(async () => (await notebooksOf(account)).map((n) => [n.title, n.subject_id]), { timeout: 15_000 })
      .toEqual([["Aula 07 · Esqueleto", anatomia.id]]);

    await page.getByRole("button", { name: "Opções de Aula 07 · Esqueleto" }).click();
    await page.getByRole("button", { name: "Excluir caderno" }).click();
    await page.getByRole("dialog", { name: "Excluir caderno?" }).getByRole("button", { name: "Excluir" }).click();
    await expect(page.getByRole("heading", { name: "Nenhum caderno ainda" })).toBeVisible();
    await expect.poll(async () => (await notebooksOf(account)).length, { timeout: 15_000 }).toBe(0);
  });

  test("Matéria: “Nova nota” já vem com a matéria; aparece em Anotações e no contador", async ({ page, account }) => {
    const subject = await seedSubject(account, { name: "Histologia", color: "lilas" });
    await page.goto(`/materias/${subject.id}`);
    await expect(page.getByText("Os cadernos desta matéria aparecem aqui.")).toBeVisible();
    await page.getByRole("button", { name: "Nova nota" }).click();
    const sheet = page.getByRole("dialog", { name: "Novo caderno" });
    await expect(sheet.getByRole("radio", { name: "Histologia" })).toHaveAttribute("aria-checked", "true");
    await sheet.getByLabel("Título").fill("Tecido epitelial");
    await sheet.getByRole("button", { name: "Criar e abrir" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Tecido epitelial" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Histologia" })).toBeVisible();

    await page.goBack();
    await expect(page.getByRole("link", { name: /Tecido epitelial.*página 1 de 1/ })).toBeVisible();
    await page.getByRole("tab", { name: "Anotações" }).click();
    await expect(page.getByRole("article").filter({ hasText: "Tecido epitelial" })).toBeVisible();

    await page.goto("/materias");
    await expect(page.getByRole("link", { name: /Histologia/ })).toContainText("1 nota");
  });
});

test.describe("Caderno sem internet", () => {
  test("cria caderno e páginas offline; sobem quando a rede volta", async ({ page, context, account, browserName }) => {
    test.skip(
      browserName !== "chromium",
      "Precache do service worker verificado no Chromium (o WebKit do CI não o completa).",
    );
    await page.goto("/caderno");
    await expect(page.getByRole("heading", { name: "Nenhum caderno ainda" })).toBeVisible();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 });
    await page.waitForFunction(
      async () => Boolean(await caches.match("/caderno/editar", { ignoreSearch: true })),
      null,
      {
        timeout: 30_000,
      },
    );

    await context.setOffline(true);
    await page.getByRole("button", { name: "Novo caderno" }).first().click();
    const sheet = page.getByRole("dialog", { name: "Novo caderno" });
    await sheet.getByLabel("Título").fill("Aula sem rede");
    await sheet.getByRole("button", { name: "Criar e abrir" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Aula sem rede" })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Offline · será sincronizado");
    await page.getByRole("button", { name: "Adicionar página" }).click();
    await expect(page.getByRole("status")).toContainText("Página 2 de 2");
    expect(await notebooksOf(account)).toEqual([]);

    await context.setOffline(false);
    await expect
      .poll(async () => (await notebooksOf(account)).map((n) => [n.title, n.notebook_pages.length]), {
        timeout: 20_000,
      })
      .toEqual([["Aula sem rede", 2]]);
    await expect(page.getByRole("status")).toContainText("Salvo");
  });
});
