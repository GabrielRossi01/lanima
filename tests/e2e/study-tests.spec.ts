import type { Page } from "@playwright/test";
import {
  adminClient,
  liftAppAiCap,
  seedAiUsage,
  seedReading,
  seedSubject,
  seedTopics,
  type TestAccount,
} from "./helpers/accounts";
import { expect, test } from "./helpers/fixtures";
import { acceptAiNotice, PAGES, seedBankQuestion, seedSummary } from "./helpers/study";

// "Criar teste" (section 7.5): content, configuration and the choice of questions, with the
// simulated AI provider (playwright.config.ts).

test.beforeAll(liftAppAiCap);

async function questionsOf(account: TestAccount) {
  const { data, error } = await adminClient()
    .from("questions")
    .select("id, statement, status, origin, difficulty, batch_key")
    .eq("user_id", account.id);
  if (error) throw error;
  return data;
}

async function testsOf(account: TestAccount) {
  const { data, error } = await adminClient().from("tests").select("*").eq("user_id", account.id);
  if (error) throw error;
  return data;
}

async function questionRuns(account: TestAccount) {
  const { data } = await adminClient()
    .from("ai_usage")
    .select("id")
    .eq("user_id", account.id)
    .eq("operation", "questoes");
  return data?.length ?? 0;
}

/** Sets the count of one level with the − and + buttons. */
async function setLevel(page: Page, level: "fácil" | "médio" | "difícil", from: number, to: number) {
  const group = page.getByRole("group", { name: `Questões de nível ${level}` });
  const button = group.getByRole("button", { name: to < from ? "Menos questões" : "Mais questões" });
  for (let i = 0; i < Math.abs(to - from); i++) await button.click();
  await expect(group).toContainText(String(to));
}

test.describe("Criar teste", () => {
  test("do resumo ao teste salvo: tópicos, níveis, modo prova e a escolha das questões", async ({ page, account }) => {
    const subject = await seedSubject(account, { name: "Anatomia", color: "celeste" });
    await seedTopics(account, subject.id, ["Articulações", "Tecido ósseo"]);
    const { summaryId } = await seedSummary(account, { fileName: "Slides Esqueleto", subjectId: subject.id });

    await page.goto(`/estudo/resumo/${summaryId}`);
    await page.getByRole("link", { name: "Criar teste deste resumo" }).click();

    // Step 1: the summary comes checked; its topics, then the syllabus (without repeating).
    await expect(page.getByRole("heading", { level: 1, name: "Escolha o conteúdo" })).toBeVisible();
    await expect(page.getByText("Novo teste · Anatomia")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /^Sistema esquelético Resumo completo/ })).toBeChecked();
    await expect(page.getByRole("group", { name: "Tópicos do resumo" }).getByRole("button")).toHaveText([
      "Sistema esquelético",
      "Tecido ósseo",
      "Ossificação",
    ]);
    await expect(page.getByRole("group", { name: "Tópicos do plano de ensino" }).getByRole("button")).toHaveText([
      "Articulações",
    ]);
    await page.getByRole("button", { name: "Ossificação" }).click();
    const aside = page.getByRole("complementary", { name: "Resumo do conteúdo" });
    await expect(aside).toContainText("1 fonte");
    await expect(aside).toContainText("3 de 4 tópicos");
    await aside.getByRole("button", { name: "Continuar" }).click();

    // Step 2: 2 easy, 2 medium, 1 hard; exam mode with 30 minutes.
    await expect(page.getByRole("heading", { level: 1, name: "Configure o teste" })).toBeVisible();
    await setLevel(page, "fácil", 5, 2);
    await setLevel(page, "médio", 10, 2);
    await setLevel(page, "difícil", 5, 1);
    await page.getByRole("radio", { name: /^Prova/ }).click();
    await page.getByRole("radio", { name: "30", exact: true }).click();
    const summary = page.getByRole("complementary", { name: "Seu teste" });
    await expect(summary).toContainText("5 questões");
    await expect(summary).toContainText("2 fáceis · 2 médias · 1 difícil");
    await expect(summary).toContainText("Modo Prova · 30 min");
    await expect(summary).toContainText(
      "A IA vai sugerir 8 questões para você escolher as melhores. Usa 1 das 15 gerações de hoje.",
    );
    await summary.getByRole("button", { name: "Gerar questões" }).click();
    await page.getByRole("dialog", { name: "Antes de usar a IA" }).getByRole("button", { name: "Entendi" }).click();

    // Step 3: 8 suggested (3 easy, 3 medium, 2 hard), the 5 asked for come selected.
    await expect(page.getByRole("heading", { level: 1, name: "Escolha as questões" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Todas 8" })).toBeVisible();
    const counter = page.getByText(/selecionadas ·/);
    await expect(counter).toHaveText("5 de 5 selecionadas · Pronto: 5 de 5");
    const include = (n: number) => page.getByRole("button", { name: `Incluir questão ${n}`, exact: true });
    await expect(include(1)).toHaveAttribute("aria-pressed", "true");
    await expect(include(3)).toHaveAttribute("aria-pressed", "false");

    await include(3).click();
    await expect(counter).toHaveText("6 de 5 selecionadas · Pronto: 6 de 5");
    // Flag 1: out of the test and of future suggestions.
    await page.getByRole("button", { name: "Sinalizar a questão 1 como errada ou confusa" }).click();
    await expect(page.getByText("Sinalizada como confusa")).toBeVisible();
    await expect(counter).toHaveText("5 de 5 selecionadas · Pronto: 5 de 5");
    // Swap 2 for another of the same level, type and topic.
    const before = (await questionsOf(account)).map((q) => q.statement);
    await page.getByRole("button", { name: "Gerar outra parecida com a questão 2" }).click();
    await expect.poll(async () => (await questionsOf(account)).length).toBe(before.length + 1);
    await expect(include(2)).toHaveAttribute("aria-pressed", "true");
    // Edit 4.
    await page.getByRole("button", { name: "Editar questão 4" }).click();
    const editor = page.getByRole("dialog", { name: "Editar questão" });
    await editor.getByLabel("Enunciado").fill("Qual célula forma a matriz óssea? (editada)");
    await editor.getByRole("button", { name: "Salvar questão" }).click();
    await expect(page.getByText("Qual célula forma a matriz óssea? (editada)")).toBeVisible();
    // Write one by hand.
    await page.getByRole("button", { name: "+ Escrever questão" }).click();
    const writer = page.getByRole("dialog", { name: "Escrever questão" });
    await writer.getByLabel("Tipo").selectOption({ label: "Verdadeiro ou falso" });
    await writer.getByLabel("Enunciado").fill("O fêmur é o maior osso do corpo humano.");
    await writer.getByRole("button", { name: "Verdadeira" }).click();
    await writer.getByRole("button", { name: "Salvar questão" }).click();
    await expect(page.getByText("Escrita por você")).toBeVisible();
    await expect(counter).toHaveText("6 de 5 selecionadas · Pronto: 6 de 5");

    await page.getByLabel("Nome do teste").fill("Ossos · revisão");
    await page.getByRole("button", { name: "Criar teste" }).click();
    await expect(page.getByText("Teste salvo")).toBeVisible();
    await expect(page).toHaveURL(/\/estudo$/);
    await expect(page.getByRole("region", { name: "Testes" })).toContainText("Ossos · revisão");
    await expect(page.getByRole("region", { name: "Testes" })).toContainText("6 questões");

    const [saved] = await testsOf(account);
    expect(saved).toMatchObject({
      title: "Ossos · revisão",
      subject_id: subject.id,
      config: {
        counts: { facil: 2, medio: 2, dificil: 1 },
        mode: "prova",
        timeLimitMin: 30,
        topics: ["Sistema esquelético", "Tecido ósseo", "Articulações"],
        sources: { summaryIds: [summaryId] },
      },
    });
    expect(saved.question_ids).toHaveLength(6);
    const questions = await questionsOf(account);
    const byId = new Map(questions.map((q) => [q.id, q]));
    for (const id of saved.question_ids) expect(byId.get(id)?.status).toBe("aprovada");
    expect(questions.filter((q) => q.status === "sinalizada")).toHaveLength(1);
    expect(questions.filter((q) => q.origin === "manual")).toMatchObject([
      { status: "aprovada", statement: "O fêmur é o maior osso do corpo humano." },
    ]);
    // The 2 not chosen and the one swapped out.
    expect(questions.filter((q) => q.status === "descartada")).toHaveLength(3);
    expect(
      questions.some((q) => q.statement === "Qual célula forma a matriz óssea? (editada)" && q.status === "aprovada"),
    ).toBe(true);
    // Order of the test: easy, medium, hard.
    const levels = saved.question_ids.map((id: string) => byId.get(id)!.difficulty);
    expect(levels).toEqual(
      [...levels].sort(
        (a: string, b: string) => ["facil", "medio", "dificil"].indexOf(a) - ["facil", "medio", "dificil"].indexOf(b),
      ),
    );
    expect(await questionRuns(account)).toBe(2);
  });

  test("banco primeiro: com questões aprovadas suficientes, não gasta geração", async ({ page, account }) => {
    const subject = await seedSubject(account, { name: "Bioquímica", color: "rosa" });
    await seedReading(account, { name: "Enzimas.pdf", subjectId: subject.id, pages: PAGES });
    for (const [difficulty, statement] of [
      ["facil", "O que é uma enzima?"],
      ["facil", "O que é o sítio ativo?"],
      ["medio", "Como a temperatura altera a atividade enzimática?"],
      ["medio", "O que muda na inibição competitiva?"],
      ["dificil", "Caso: paciente com CK-MB alta; o que sugere?"],
    ] as const) {
      await seedBankQuestion(account, { subjectId: subject.id, topic: "Enzimas", difficulty, statement });
    }

    await page.goto(`/estudo/novo-teste?materia=${subject.id}`);
    await page.getByRole("checkbox", { name: /^Enzimas\.pdf/ }).check();
    await expect(page.getByRole("complementary", { name: "Resumo do conteúdo" })).toContainText("5 questões aprovadas");
    await page.getByRole("button", { name: "Continuar" }).click();
    await setLevel(page, "fácil", 5, 2);
    await setLevel(page, "médio", 10, 2);
    await setLevel(page, "difícil", 5, 1);
    const summary = page.getByRole("complementary", { name: "Seu teste" });
    await expect(summary).toContainText("Todas as 5 questões vêm do seu banco: não usa gerações de hoje.");
    await summary.getByRole("button", { name: "Ver as questões" }).click();

    await expect(page.getByText("Do seu banco", { exact: true })).toHaveCount(5);
    await page.getByRole("button", { name: "Criar teste" }).click();
    await expect(page.getByText("Teste salvo")).toBeVisible();
    expect((await testsOf(account))[0].question_ids).toHaveLength(5);
    expect(await questionRuns(account)).toBe(0);
  });

  test("sem gerações de questões hoje: não deixa gerar", async ({ page, account }) => {
    await seedReading(account, { name: "Limite.pdf", pages: PAGES });
    await seedAiUsage(account, "questoes", 15);
    await acceptAiNotice(account);
    await page.goto("/estudo/novo-teste");
    await page.getByRole("checkbox", { name: /^Limite\.pdf/ }).check();
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText("Usa 1 das 0 gerações de hoje.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Gerar questões" })).toBeDisabled();
  });

  test("sem arquivos: o passo 1 manda enviar o material", async ({ page, account }) => {
    void account;
    await page.goto("/estudo/novo-teste");
    await expect(page.getByRole("heading", { name: "Nenhum arquivo ainda" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Enviar arquivos" })).toHaveAttribute("href", "/arquivos");
  });
});
