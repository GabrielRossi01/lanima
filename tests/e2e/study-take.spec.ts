import type { Page } from "@playwright/test";
import { adminClient, seedSubject, type TestAccount } from "./helpers/accounts";
import { expect, test } from "./helpers/fixtures";
import { seedTest } from "./helpers/study";

// Taking a test and its result (section 7.5, "Fazer o teste" and "Resultado"). The test of
// helpers/study.ts has, in order: multiple choice, true/false, matching, clinical case, short answer.

async function attemptsOf(account: TestAccount) {
  const { data, error } = await adminClient()
    .from("test_attempts")
    .select("id, score, completed, mode, attempt_answers(question_id, response, correct, self_assessment, marked)")
    .eq("user_id", account.id);
  if (error) throw error;
  return data;
}

async function confirm(page: Page) {
  await page.getByRole("button", { name: "Confirmar resposta" }).click();
}

const next = (page: Page) => page.getByRole("button", { name: "Próxima" }).click();

test.describe("Fazer o teste", () => {
  test("treino: corrige cada questão na hora, dos 5 tipos, e mostra o resultado por tópico e nível", async ({
    page,
    account,
  }) => {
    const subject = await seedSubject(account, { name: "Anatomia", color: "celeste" });
    await seedTest(account, { subjectId: subject.id });
    await page.goto("/estudo");
    await page.getByRole("article", { name: "Ossos · revisão" }).getByRole("link", { name: "Começar" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Ossos · revisão" })).toBeVisible();
    await page.getByRole("button", { name: "Começar" }).click();

    // 1. Multiple choice, right.
    await expect(page.getByText("Questão 1 de 5 · Treino")).toBeVisible();
    await page.getByRole("radio", { name: /206/ }).click();
    await confirm(page);
    await expect(page.getByText("Correta!")).toBeVisible();
    await expect(page.getByText("O esqueleto adulto tem 206 ossos.")).toBeVisible();
    await next(page);
    // 2. True/false, wrong.
    await page.getByRole("radio", { name: "Falso" }).click();
    await confirm(page);
    await expect(page.getByText("Não foi dessa vez. A afirmação é verdadeira.")).toBeVisible();
    await next(page);
    // 3. Matching: tap an item, then what goes with it.
    await expect(page.getByRole("button", { name: "Confirmar resposta" })).toHaveCount(0);
    for (const [item, pair] of [
      ["1. Osteoblasto", "Forma matriz"],
      ["2. Osteoclasto", "Reabsorve osso"],
      ["3. Osteócito", "Mantém a matriz"],
    ]) {
      await page.getByRole("button", { name: new RegExp(`^${item.replace(".", "\\.")}`) }).click();
      await page.getByRole("button", { name: `Ligar a: ${pair}` }).click();
    }
    await confirm(page);
    await expect(page.getByText("Correta!")).toBeVisible();
    await next(page);
    // 4. Clinical case, wrong.
    await page.getByRole("radio", { name: /Excesso de cálcio/ }).click();
    await confirm(page);
    await expect(page.getByText("Não foi dessa vez. A correta é a A.")).toBeVisible();
    await next(page);
    // 5. Short answer: the expected one, then her own judgment.
    await page.getByLabel("Sua resposta").fill("A parte do meio do osso.");
    await confirm(page);
    await expect(page.getByText("O corpo do osso longo.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Ver resultado" })).toBeDisabled();
    await page
      .getByRole("radiogroup", { name: "Como foi a sua resposta" })
      .getByRole("radio", { name: "Parcial" })
      .click();
    await page.getByRole("button", { name: "Ver resultado" }).click();

    // Result: 1 + 0 + 1 + 0 + 0.5 of 5.
    await expect(page).toHaveURL(/\/estudo\/resultado\?tentativa=/);
    const card = page.getByRole("region", { name: "Resultado" });
    await expect(card).toContainText("50%");
    await expect(card).toContainText("2 de 5 corretas");
    await expect(card).toContainText("+5 pts");
    await expect(page.getByRole("progressbar", { name: "Ossos" })).toHaveAttribute("aria-valuenow", "50");
    await expect(page.getByRole("progressbar", { name: "Células" })).toHaveAttribute("aria-valuenow", "50");
    await expect(page.getByRole("progressbar", { name: "Fácil" })).toHaveAttribute("aria-valuenow", "50");
    await expect(page.getByRole("progressbar", { name: "Médio" })).toHaveAttribute("aria-valuenow", "100");
    await expect(page.getByRole("progressbar", { name: "Difícil" })).toHaveAttribute("aria-valuenow", "25");
    await expect(page.getByText("Para revisar")).toHaveCount(2);
    await expect(page.getByRole("heading", { name: "Questões que você errou" })).toBeVisible();
    await expect(page.getByText("Correta: Verdadeiro")).toBeVisible();

    // The database grades it the same way.
    await expect.poll(async () => (await attemptsOf(account))[0]?.score).toBe(50);
    const [saved] = await attemptsOf(account);
    expect(saved).toMatchObject({ completed: true, mode: "treino" });
    expect(saved.attempt_answers).toHaveLength(5);

    // Resumos e testes: the score, "Resultado", "Refazer" and what to review.
    await page.goto("/estudo");
    const row = page.getByRole("article", { name: "Ossos · revisão" });
    await expect(row).toContainText("50%");
    await expect(row.getByRole("link", { name: "Refazer" })).toBeVisible();
    const review = page.getByRole("region", { name: "Para revisar" });
    await expect(review).toContainText("Ossos · 50%");
    await expect(review).toContainText("Células · 50%");
  });

  test("refazer só as erradas: um teste novo com elas, embaralhadas", async ({ page, account }) => {
    const subject = await seedSubject(account, { name: "Anatomia", color: "celeste" });
    const { testId } = await seedTest(account, { subjectId: subject.id, mode: "prova" });
    await page.goto(`/estudo/fazer?teste=${testId}`);
    await page.getByRole("button", { name: "Começar" }).click();
    await page.getByRole("radio", { name: /206/ }).click();
    await page.getByRole("button", { name: "Entregar" }).click();
    await page
      .getByRole("dialog", { name: "Entregar a prova?" })
      .getByRole("button", { name: "Entregar mesmo assim" })
      .click();
    await expect(page.getByRole("region", { name: "Resultado" })).toContainText("20%");

    await page.getByRole("button", { name: "Refazer só as erradas" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Ossos · revisão · erradas" })).toBeVisible();
    await expect(page.getByText("4 questões")).toBeVisible();
    const { data: tests } = await adminClient().from("tests").select("title, question_ids").eq("user_id", account.id);
    const redo = tests!.find((t) => t.title.endsWith("· erradas"))!;
    expect(redo.question_ids).toHaveLength(4);
  });

  test("prova: sem correção até o fim, com cronômetro, mapa, marcar para revisar e a resposta curta corrigida por ela", async ({
    page,
    account,
  }) => {
    const subject = await seedSubject(account, { name: "Anatomia", color: "celeste" });
    const { testId, questionIds } = await seedTest(account, { subjectId: subject.id, mode: "prova", timeLimitMin: 15 });
    await page.goto(`/estudo/fazer?teste=${testId}`);
    await expect(page.getByText("Resultado só no fim, com 15 minutos.")).toBeVisible();
    await page.getByRole("button", { name: "Começar" }).click();
    await expect(page.getByLabel("Tempo restante")).toContainText(/1[45]:\d\d/);

    await page.getByRole("radio", { name: /206/ }).click();
    await expect(page.getByText("Correta!")).toHaveCount(0);
    await next(page);
    await page.getByRole("button", { name: "Marcar para revisar" }).click();
    await expect(page.getByRole("button", { name: "Marcar para revisar" })).toHaveAttribute("aria-pressed", "true");
    const map = page.getByRole("navigation", { name: "Mapa de questões" });
    await expect(map.getByRole("button", { name: "Questão 2, em branco, marcada para revisar" })).toBeVisible();
    await map.getByRole("button", { name: /^Questão 5/ }).click();
    await page.getByLabel("Sua resposta").fill("O corpo do osso longo.");
    await expect(map.getByRole("button", { name: "Questão 1, respondida" })).toBeVisible();

    await page.getByRole("button", { name: "Entregar" }).click();
    const dialog = page.getByRole("dialog", { name: "Entregar a prova?" });
    await expect(dialog).toContainText("3 questões estão em branco e contam como erradas.");
    await dialog.getByRole("button", { name: "Entregar mesmo assim" }).click();
    await expect(page.getByRole("heading", { name: "Corrija suas respostas curtas" })).toBeVisible();
    await page
      .getByRole("radiogroup", { name: "Como foi a questão 5" })
      .getByRole("radio", { name: "Acertei" })
      .click();
    await page.getByRole("button", { name: "Ver resultado" }).click();
    await expect(page.getByRole("region", { name: "Resultado" })).toContainText("40%");

    await expect.poll(async () => (await attemptsOf(account))[0]?.score).toBe(40);
    const [saved] = await attemptsOf(account);
    expect(saved.mode).toBe("prova");
    expect(saved.attempt_answers.find((a) => a.question_id === questionIds[1])).toMatchObject({
      marked: true,
      response: null,
    });
    expect(saved.attempt_answers.find((a) => a.question_id === questionIds[4])).toMatchObject({
      self_assessment: "acertei",
      correct: true,
    });
  });

  test("parar no meio e continuar de onde parou", async ({ page, account }) => {
    const subject = await seedSubject(account, { name: "Anatomia", color: "celeste" });
    const { testId } = await seedTest(account, { subjectId: subject.id });
    await page.goto(`/estudo/fazer?teste=${testId}`);
    await page.getByRole("button", { name: "Começar" }).click();
    await page.getByRole("radio", { name: /206/ }).click();
    await confirm(page);
    await next(page);
    await page.getByRole("link", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/estudo$/);

    await page.goto(`/estudo/fazer?teste=${testId}`);
    await expect(page.getByText("Você parou na questão 2 de 5, no modo Treino.")).toBeVisible();
    await page.getByRole("button", { name: "Continuar de onde parou" }).click();
    await expect(page.getByText("Questão 2 de 5 · Treino")).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Mapa de questões" }).getByRole("button", { name: "Questão 1, respondida" }),
    ).toBeVisible();
    expect(await attemptsOf(account)).toEqual([]);
  });
});

test.describe("Fazer o teste sem internet", () => {
  test("um teste salvo abre sem internet, mesmo depois de recarregar a página", async ({
    page,
    context,
    account,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Precache do service worker verificado no Chromium (o WebKit do CI não o completa).",
    );
    const subject = await seedSubject(account, { name: "Anatomia", color: "celeste" });
    const { testId } = await seedTest(account, { subjectId: subject.id, mode: "prova" });
    await page.goto(`/estudo/fazer?teste=${testId}`);
    await expect(page.getByRole("button", { name: "Começar" })).toBeVisible();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 });
    // Its questions are on the device (the cache is written on a 1 s throttle).
    await page.waitForFunction(() => (localStorage.getItem("lanima:cache") ?? "").includes("test-questions"));

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Ossos · revisão" })).toBeVisible();
    await page.getByRole("button", { name: "Começar" }).click();
    await expect(page.getByText("Questão 1 de 5 · Prova")).toBeVisible();
    // Reloading again keeps the list: what the cache restored is hers, so it isn't dropped.
    await page.reload();
    await expect(page.getByRole("button", { name: "Continuar de onde parou" })).toBeVisible();
  });

  test("a tentativa é corrigida no aparelho e sobe quando a rede volta", async ({
    page,
    context,
    account,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Precache do service worker verificado no Chromium (o WebKit do CI não o completa).",
    );
    const subject = await seedSubject(account, { name: "Anatomia", color: "celeste" });
    const { testId } = await seedTest(account, { subjectId: subject.id, mode: "prova" });
    await page.goto(`/estudo/fazer?teste=${testId}`);
    await expect(page.getByRole("button", { name: "Começar" })).toBeVisible();
    // The result page and its code come from the service worker: wait until it controls this page
    // and its precache is complete.
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 });
    await page.waitForFunction(
      async () => Boolean(await caches.match("/estudo/resultado", { ignoreSearch: true })),
      null,
      {
        timeout: 30_000,
      },
    );

    await context.setOffline(true);
    await page.getByRole("button", { name: "Começar" }).click();
    await page.getByRole("radio", { name: /206/ }).click();
    await page.getByRole("button", { name: "Entregar" }).click();
    await page
      .getByRole("dialog", { name: "Entregar a prova?" })
      .getByRole("button", { name: "Entregar mesmo assim" })
      .click();
    await expect(page.getByRole("region", { name: "Resultado" })).toContainText("20%");
    await expect(page.getByText("Offline · será sincronizado")).toBeVisible();
    expect(await attemptsOf(account)).toEqual([]);

    // Back online, the page is not reloaded (a mark left on it stays): the attempt goes up through
    // the queue and the screen updates by itself.
    await page.evaluate(() => Object.assign(window, { __lanimaMark: true }));
    await context.setOffline(false);
    await expect.poll(async () => (await attemptsOf(account))[0]?.score, { timeout: 15_000 }).toBe(20);
    await expect(page.getByText("Offline · será sincronizado")).toHaveCount(0);
    expect(await page.evaluate(() => "__lanimaMark" in window)).toBe(true);
  });
});
