import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Download, Page } from "@playwright/test";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { adminClient, seedSubject } from "./helpers/accounts";
import { expect, test } from "./helpers/fixtures";
import { notebooksOf, seedNotebook } from "./helpers/notebook";
import { seedSummary } from "./helpers/study";

// Phase 7, part 5: the notebook with the rest of the app. "Usar no resumo", PDF and sharing,
// "Salvar no caderno" from a summary, and the global search.

const TEXT = "Fêmur: o osso mais longo do corpo humano.";
const textBox = { id: "t1", type: "texto", x: 100, y: 200, w: 700, text: TEXT, size: 24 };

/** Playwright's WebKit reports spaces in download names as "_". */
const downloadName = (download: Download) => download.suggestedFilename().replace(/_/g, " ");

async function pdfText(download: Download): Promise<string[]> {
  const data = new Uint8Array(await readFile((await download.path())!));
  expect(new TextDecoder().decode(data.slice(0, 5))).toBe("%PDF-");
  const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " "),
    );
  }
  return pages;
}

/** One of the page's actions: an icon on the top bar, or on phones under "Mais opções". */
async function pageAction(page: Page, label: string) {
  const icon = page.getByRole("button", { name: label, exact: true });
  if (await icon.isVisible()) return icon.click();
  await page.getByRole("button", { name: "Mais opções" }).click();
  await page.getByRole("dialog", { name: "Mais opções" }).getByRole("button", { name: label }).click();
}

async function openNotebook(page: Page, pageId: string, title = "Aula 07") {
  await page.goto(`/caderno/editar?pagina=${pageId}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

test.describe("Caderno com o resto do app", () => {
  test("“Usar no resumo”: o texto da página vira fonte do resumo e do teste", async ({ page, account }) => {
    const subject = await seedSubject(account, { name: "Anatomia", color: "celeste" });
    const { pageIds } = await seedNotebook(account, {
      title: "Aula 07",
      subjectId: subject.id,
      pages: [{ elements: [textBox] }],
    });
    await openNotebook(page, pageIds[0]);
    await pageAction(page, "Usar no resumo");
    const dialog = page.getByRole("dialog", { name: "Usar no resumo" });
    await expect(dialog).toContainText("A letra à mão ainda não é lida");
    await dialog.getByRole("button", { name: "Usar esta página" }).click();

    await expect(page).toHaveURL(/\/estudo/);
    const sheet = page.getByRole("dialog", { name: "Novo resumo" });
    await expect(sheet.getByRole("checkbox", { name: /Aula 07 · pág\. 1/ })).toBeChecked();
    const { data: chunks } = await adminClient()
      .from("document_chunks")
      .select("text, documents!inner(notebook_page_id)")
      .eq("documents.notebook_page_id", pageIds[0]);
    expect(chunks?.map((c) => c.text)).toEqual([TEXT]);

    await sheet.getByRole("button", { name: "Gerar resumo" }).click();
    await page.getByRole("dialog", { name: "Antes de usar a IA" }).getByRole("button", { name: "Entendi" }).click();
    await expect(page).toHaveURL(/\/estudo\/resumo\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("link", { name: "Abrir fonte: Aula 07 · pág. 1" }).first()).toBeVisible();

    // The same page is a source of tests too.
    await page.goto(`/estudo/novo-teste?materia=${subject.id}`);
    await expect(page.getByRole("checkbox", { name: /Aula 07 · pág\. 1/ })).toBeVisible();

    // And the source opens the page in the notebook.
    await page.goBack();
    await page.getByRole("link", { name: "Abrir fonte: Aula 07 · pág. 1" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Aula 07" })).toBeVisible();
  });

  test("“Usar no resumo” numa página só com letra à mão explica o que fazer", async ({ page, account }) => {
    const { pageIds } = await seedNotebook(account, { title: "Aula 07" });
    await openNotebook(page, pageIds[0]);
    await pageAction(page, "Usar no resumo");
    const dialog = page.getByRole("dialog", { name: "Usar no resumo" });
    await dialog.getByRole("button", { name: "Usar esta página" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Escreva numa caixa de texto ou cole uma foto do material");
    await expect(page).toHaveURL(/\/caderno\/editar/);
  });

  test("exportar a página ou o caderno em PDF, com o texto das caixas", async ({ page, account }) => {
    const { pageIds } = await seedNotebook(account, {
      title: "Aula 07",
      pages: [{ elements: [textBox] }, { background: "pautado" }],
    });
    await openNotebook(page, pageIds[0]);

    await pageAction(page, "Exportar como PDF");
    let dialog = page.getByRole("dialog", { name: "Exportar como PDF" });
    let download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Baixar PDF" }).click();
    const one = await download;
    expect(downloadName(one)).toBe("Aula 07 · página 1.pdf");
    expect(await pdfText(one)).toEqual([expect.stringContaining("Fêmur: o osso mais longo do corpo humano.")]);

    await pageAction(page, "Exportar como PDF");
    dialog = page.getByRole("dialog", { name: "Exportar como PDF" });
    await dialog.getByRole("radio", { name: /Caderno inteiro/ }).click();
    download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Baixar PDF" }).click();
    const all = await download;
    expect(downloadName(all)).toBe("Aula 07.pdf");
    expect(await pdfText(all)).toHaveLength(2);

    // From the list too: the "⋯" of the card.
    await page.goto("/caderno");
    await page.getByRole("button", { name: "Opções de Aula 07" }).click();
    download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar em PDF" }).click();
    expect(downloadName(await download)).toBe("Aula 07.pdf");
  });

  test("compartilhar: pelo sistema quando ele aceita arquivos; senão, baixa o PDF", async ({ page, account }) => {
    await page.addInitScript(() => {
      const shared: string[] = [];
      Object.assign(window, { __shared: shared });
      Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (data: { files?: File[] }) => {
          shared.push(...(data.files ?? []).map((f) => `${f.name}|${f.type}`));
        },
      });
    });
    const { pageIds } = await seedNotebook(account, { title: "Aula 07", pages: [{ elements: [textBox] }] });
    await openNotebook(page, pageIds[0]);
    await pageAction(page, "Compartilhar");
    await page.getByRole("dialog", { name: "Compartilhar" }).getByRole("button", { name: "Compartilhar PDF" }).click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __shared: string[] }).__shared))
      .toEqual(["Aula 07.pdf|application/pdf"]);

    // A browser that can't share files: the PDF is downloaded instead.
    await page.evaluate(() => Object.defineProperty(navigator, "canShare", { configurable: true, value: () => false }));
    await pageAction(page, "Compartilhar");
    const download = page.waitForEvent("download");
    await page.getByRole("dialog", { name: "Compartilhar" }).getByRole("button", { name: "Compartilhar PDF" }).click();
    expect(downloadName(await download)).toBe("Aula 07.pdf");
    await expect(page.getByText("Este aparelho não compartilha arquivos")).toBeVisible();
  });

  test("“Salvar no caderno”: o resumo vira caixas de texto num caderno novo", async ({ page, account }) => {
    const subject = await seedSubject(account, { name: "Anatomia", color: "celeste" });
    const { summaryId } = await seedSummary(account, { fileName: "Slides Esqueleto", subjectId: subject.id });
    await page.goto(`/estudo/resumo/${summaryId}`);
    await page.getByRole("button", { name: "Salvar no caderno" }).click();
    const sheet = page.getByRole("dialog", { name: "Salvar no caderno" });
    await expect(sheet.getByRole("radio", { name: /Novo caderno/ })).toHaveAttribute("aria-checked", "true");
    await sheet.getByRole("button", { name: "Salvar no caderno" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Sistema esquelético" })).toBeVisible();
    const boxes = page.getByRole("textbox", { name: "Caixa de texto" });
    await expect(boxes.first()).toHaveValue("Sistema esquelético");
    await expect(boxes.nth(2)).toHaveValue(/^• O esqueleto humano adulto tem 206 ossos\./);
    await expect
      .poll(async () => (await notebooksOf(account)).map((n) => [n.title, n.subject_id]), { timeout: 15_000 })
      .toEqual([["Sistema esquelético", subject.id]]);
  });

  test("a busca do Início acha a página pelo texto das caixas", async ({ page, account }) => {
    const { pageIds } = await seedNotebook(account, { title: "Aula 07", pages: [{ elements: [textBox] }] });
    await page.goto("/inicio");
    await page.getByRole("searchbox").first().fill("femur");
    const results = page.getByRole("region", { name: /resultados/i });
    await results.getByRole("link", { name: /Aula 07 · pág\. 1/ }).click();
    await expect(page).toHaveURL(new RegExp(`pagina=${pageIds[0]}`));
    await expect(page.getByRole("heading", { level: 1, name: "Aula 07" })).toBeVisible();
  });

  test("“Usar no resumo” lê a foto colada (OCR)", async ({ page, account, browserName }) => {
    test.skip(browserName !== "chromium", "OCR verificado no Chromium; em Arquivos ele roda nos dois.");
    test.setTimeout(150_000);
    const { pageIds } = await seedNotebook(account, { title: "Aula 07" });
    await openNotebook(page, pageIds[0]);
    const chooser = page.waitForEvent("filechooser");
    const image = page.getByRole("button", { name: "Inserir imagem ou foto" });
    if (!(await image.isVisible())) await page.getByRole("button", { name: "Mais ferramentas" }).click();
    await image.click();
    await (await chooser).setFiles(join(__dirname, "..", "fixtures", "files", "livro-pagina.png"));
    await expect(page.getByRole("img", { name: "Imagem colada" })).toBeVisible();

    await pageAction(page, "Usar no resumo");
    await page
      .getByRole("dialog", { name: "Usar no resumo" })
      .getByRole("button", { name: "Usar esta página" })
      .click();
    await expect(page.getByRole("dialog", { name: "Novo resumo" })).toBeVisible({ timeout: 120_000 });
    const { data: chunks } = await adminClient()
      .from("document_chunks")
      .select("text, documents!inner(notebook_page_id, used_ocr)")
      .eq("documents.notebook_page_id", pageIds[0]);
    expect(chunks?.map((c) => c.text).join(" ")).toContain("substrato específico no sítio ativo");
  });
});
