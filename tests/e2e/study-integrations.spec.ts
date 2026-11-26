import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Download, Page } from "@playwright/test";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { addDays, todayIn } from "../../lib/dates/calendar";
import { seedAssessment, seedReading, seedSubject } from "./helpers/accounts";
import { expect, test } from "./helpers/fixtures";
import { PAGES, seedFinishedAttempt, seedSummary, seedTest } from "./helpers/study";

// Phase 6, part 5: where summaries and tests meet the rest of the app (Arquivos, Matéria, Início)
// and "Exportar em PDF".

const fixture = (name: string) => join(__dirname, "..", "fixtures", "files", name);

/** 2 of 5 right (40%): the multiple choice and the true or false; Células all wrong. */
const FORTY = [{ index: 1 }, { value: true }, null, { index: 1 }, null];

/**
 * The name the app gave the download. Playwright's WebKit reports spaces as "_"
 * ("Sistema_esquelético.pdf") while Chromium keeps them: the app's name has spaces.
 */
const downloadName = (download: Download) => download.suggestedFilename().replace(/_/g, " ");

/** The text of each page of a downloaded PDF. */
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

async function openActions(page: Page, name: string) {
  await page
    .getByRole("button", { name: `Ações: ${name}` })
    .locator("visible=true")
    .click();
  const sheet = page.getByRole("dialog", { name });
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe("Resumos e testes no resto do app", () => {
  test("Arquivos: do menu e da seleção ao resumo e ao teste, já com os arquivos escolhidos", async ({
    page,
    account,
  }) => {
    const subject = await seedSubject(account, { name: "Anatomia", color: "celeste" });
    const aula7 = await seedReading(account, { name: "Aula 07.pdf", subjectId: subject.id, pages: PAGES });
    await seedReading(account, { name: "Aula 08.pdf", subjectId: subject.id, pages: PAGES });

    await page.goto("/arquivos");
    let actions = await openActions(page, "Aula 07.pdf");
    await actions.getByRole("button", { name: "Resumir em tópicos" }).click();
    await expect(page).toHaveURL(new RegExp(`/estudo\\?resumir=${aula7.fileId}`));
    let sheet = page.getByRole("dialog", { name: "Novo resumo" });
    await expect(sheet.getByRole("checkbox", { name: /Aula 07/ })).toBeChecked();
    await expect(sheet.getByRole("checkbox", { name: /Aula 08/ })).not.toBeChecked();
    // Closing clears the address: a reload doesn't open the sheet again.
    await sheet.getByRole("button", { name: "Fechar" }).click();
    await expect(page).toHaveURL(/\/estudo$/);

    await page.goto("/arquivos");
    actions = await openActions(page, "Aula 07.pdf");
    await actions.getByRole("button", { name: "Criar teste" }).click();
    await expect(page).toHaveURL(/\/estudo\/novo-teste\?materia=.+&arquivo=/);
    await expect(page.getByRole("checkbox", { name: /^Aula 07\.pdf/ })).toBeChecked();
    await expect(page.getByLabel("Matéria do teste")).toHaveValue(subject.id);

    await page.goto("/arquivos");
    await page.getByRole("checkbox", { name: "Selecionar Aula 07.pdf" }).locator("visible=true").check();
    await page.getByRole("checkbox", { name: "Selecionar Aula 08.pdf" }).locator("visible=true").check();
    const bar = page.getByRole("region", { name: "Arquivos selecionados" });
    await bar.getByRole("button", { name: "Resumir juntos" }).click();
    sheet = page.getByRole("dialog", { name: "Novo resumo" });
    await expect(sheet.getByRole("checkbox", { name: /Aula 07/ })).toBeChecked();
    await expect(sheet.getByRole("checkbox", { name: /Aula 08/ })).toBeChecked();
  });

  test("Arquivos: depois do envio, o toast leva ao resumo com o arquivo escolhido", async ({ page, account }) => {
    void account;
    await page.goto("/arquivos");
    await expect(page.getByLabel("Escolher arquivos")).toBeEnabled();
    await page.getByLabel("Escolher arquivos").setInputFiles(fixture("anatomia-slides.pdf"));
    const toast = page.getByRole("listitem").filter({ hasText: "Arquivo enviado" });
    await expect(toast).toBeVisible({ timeout: 30_000 });
    await toast.getByRole("button", { name: "Resumir em tópicos" }).click();
    const sheet = page.getByRole("dialog", { name: "Novo resumo" });
    // Chosen; usable as soon as its text is read.
    await expect(sheet.getByRole("checkbox", { name: /anatomia-slides/ })).toBeChecked({ timeout: 30_000 });
  });

  test("Matéria: a aba Resumos e testes e o Último teste, com Refazer só as erradas", async ({ page, account }) => {
    const subject = await seedSubject(account, { name: "Anatomia", color: "celeste" });
    const other = await seedSubject(account, { name: "Bioquímica", color: "verde" });
    await seedSummary(account, { fileName: "Aula 07", subjectId: subject.id });
    const { testId, questionIds } = await seedTest(account, { subjectId: subject.id });
    const enzimas = await seedTest(account, { subjectId: other.id, title: "Enzimas" });
    await seedFinishedAttempt(account, { testId, questionIds, responses: FORTY });
    // Newer, but of another subject: not this one's "Último teste".
    await seedFinishedAttempt(account, { ...enzimas, responses: [{ index: 1 }, null, null, null, null] });

    await page.goto(`/materias/${subject.id}`);
    const last = page.getByRole("region", { name: "Último teste" });
    await expect(last).toContainText("Ossos · revisão");
    await expect(last).toContainText("40%");
    await expect(last).toContainText("2 de 5");
    await expect(last).toContainText("Para revisar: Células");

    await page.getByRole("tab", { name: "Resumos e testes" }).click();
    const tests = page.getByRole("region", { name: "Testes" });
    await expect(tests.getByRole("article", { name: "Ossos · revisão" })).toContainText("40%");
    // Only this subject's.
    await expect(tests.getByRole("article", { name: "Enzimas" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Resumos" })).toContainText("Sistema esquelético");

    await page.getByRole("tab", { name: "Visão geral" }).click();
    await last.getByRole("button", { name: "Refazer só as erradas" }).click();
    await expect(page).toHaveURL(/\/estudo\/fazer\?teste=/);
    await expect(page.getByRole("heading", { level: 1, name: "Ossos · revisão · erradas" })).toBeVisible();
    await expect(page.getByText("3 questões")).toBeVisible();
  });

  test("Início: acerto médio dos 7 dias, sequência com o dia do teste e Criar teste para a prova", async ({
    page,
    account,
  }) => {
    const subject = await seedSubject(account, { name: "Anatomia", color: "celeste" });
    const reading = await seedReading(account, { name: "Aula 07.pdf", subjectId: subject.id, pages: PAGES });
    await seedAssessment(account, {
      subject_id: subject.id,
      title: "P1",
      kind: "prova",
      date: addDays(todayIn(new Date()), 5),
    });
    const { testId, questionIds } = await seedTest(account, { subjectId: subject.id });
    // 40% and 80% this week (the short answer wasn't judged), 0% ten days ago: 60%.
    await seedFinishedAttempt(account, { testId, questionIds, responses: FORTY });
    await seedFinishedAttempt(account, {
      testId,
      questionIds,
      responses: [{ index: 1 }, { value: true }, { match: [2, 0, 1] }, { index: 0 }, { text: "x" }],
    });
    await seedFinishedAttempt(account, {
      testId,
      questionIds,
      responses: [null, null, null, null, null],
      finishedAt: new Date(Date.now() - 10 * 86_400_000),
    });

    await page.goto("/inicio");
    const metric = (label: string) =>
      page
        .locator("div")
        .filter({ hasText: label })
        .filter({ hasNot: page.locator("div div div") })
        .last();
    await expect(metric("Acerto médio nos testes")).toHaveText(/^60%Acerto médio nos testes$/);
    // No focus today, but a finished test: the day counts.
    await expect(metric("Sequência de estudo")).toHaveText(/^1 diaSequência de estudo$/);

    await page.getByRole("link", { name: "Criar teste para a prova" }).click();
    await expect(page).toHaveURL(new RegExp(`materia=${subject.id}&arquivo=${reading.fileId}`));
    await expect(page.getByRole("checkbox", { name: /^Aula 07\.pdf/ })).toBeChecked();
  });

  test("Exportar em PDF: o resumo, o teste com gabarito e os dois juntos em Arquivos", async ({ page, account }) => {
    const subject = await seedSubject(account, { name: "Anatomia", color: "celeste" });
    const { summaryId } = await seedSummary(account, { fileName: "Aula 07", subjectId: subject.id });
    const { testId, questionIds } = await seedTest(account, { subjectId: subject.id });
    const { attemptId } = await seedFinishedAttempt(account, { testId, questionIds, responses: FORTY });

    await page.goto(`/estudo/resumo/${summaryId}`);
    let downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar em PDF" }).click();
    let download = await downloading;
    expect(downloadName(download)).toBe("Sistema esquelético.pdf");
    let text = (await pdfText(download)).join(" ");
    expect(text).toContain("Sistema esquelético");
    expect(text).toContain("O esqueleto humano adulto tem 206 ossos.");
    expect(text).toContain("[1] Aula 07, p. 1");

    await page.goto(`/estudo/resultado?tentativa=${attemptId}`);
    await page.getByRole("button", { name: "Exportar PDF" }).click();
    const sheet = page.getByRole("dialog", { name: "Exportar em PDF" });
    await expect(sheet.getByRole("switch", { name: "Gabarito separado no fim" })).toBeChecked();
    downloading = page.waitForEvent("download");
    await sheet.getByRole("button", { name: "Baixar PDF" }).click();
    download = await downloading;
    expect(downloadName(download)).toBe("Ossos · revisão.pdf");
    const pages = await pdfText(download);
    expect(pages.join(" ")).toContain("Quantos ossos tem o esqueleto adulto?");
    expect(pages[pages.length - 1]).toContain("Gabarito");
    expect(pages[pages.length - 1]).toContain("1. B) 206");
    await expect(sheet).toBeHidden();

    await page.goto("/arquivos");
    await page.getByRole("button", { name: /^Resumos e testes/ }).click();
    const all = page.getByRole("dialog", { name: "Resumos e testes em PDF" });
    await expect(all.getByRole("checkbox", { name: /Sistema esquelético/ })).toBeChecked();
    downloading = page.waitForEvent("download");
    await all.getByRole("button", { name: "Baixar PDF (2)" }).click();
    download = await downloading;
    text = (await pdfText(download)).join(" ");
    expect(text).toContain("RESUMO Sistema esquelético");
    expect(text).toContain("TESTE Ossos · revisão");
    expect(text).toContain("Gabarito · Ossos · revisão");
  });
});
