import type { Page } from "@playwright/test";
import { addDays, formatDate, spokenDate, todayIn } from "../../lib/dates/calendar";
import { adminClient, seedAssessment, seedGoal, seedSubject, seedTopics } from "./helpers/accounts";
import { expect, test } from "./helpers/fixtures";
import { describeHorizontalOverflow } from "./helpers/overflow";

const today = () => todayIn(new Date());

async function expectNoHorizontalScroll(page: Page, label: string) {
  const { overflow, report } = await page.evaluate(describeHorizontalOverflow);
  expect(overflow, `${label}: ${overflow}px de rolagem horizontal${report}`).toBeLessThanOrEqual(0);
}

test.describe("Matérias", () => {
  test("criar matéria com aulas, importar o plano de ensino e marcar o progresso", async ({ page, account }) => {
    void account;
    await page.goto("/materias");
    await expect(page.getByRole("heading", { name: "Nenhuma matéria ainda" })).toBeVisible();
    await expectNoHorizontalScroll(page, "/materias vazia");

    await page.getByRole("button", { name: "Nova matéria" }).first().click();
    const sheet = page.getByRole("dialog", { name: "Nova matéria" });
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect(sheet.getByText("Dê um nome para a matéria.")).toBeVisible();

    await sheet.getByLabel("Nome").fill("Bioquímica");
    await sheet.getByRole("radio", { name: "Rosa" }).click();
    await sheet.getByRole("radio", { name: "Frasco" }).click();
    await sheet.getByRole("button", { name: "Adicionar aula" }).click();
    await sheet.getByLabel("Dia").selectOption("2");
    // 24 hours in any language: a text field, never the browser's own time input.
    await sheet.getByLabel("Início").fill("25:00");
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect(sheet.getByText("Use o formato 08:00.")).toBeVisible();
    await sheet.getByLabel("Início").fill("");
    await sheet.getByLabel("Início").pressSequentially("10");
    await sheet.getByLabel("Sala (opcional)").focus();
    await expect(sheet.getByLabel("Início")).toHaveValue("10:00");
    await expect(sheet.locator('input[type="time"], input[type="date"]')).toHaveCount(0);
    await sheet.getByLabel("Sala (opcional)").fill("Sala 12");
    await sheet.getByRole("button", { name: "Salvar" }).click();

    await expect(page).toHaveURL(/\/materias\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: "Bioquímica" })).toBeVisible();
    await expect(page.getByText("Ter · 10h00 · Sala 12 · 0% do conteúdo revisado")).toBeVisible();
    await expectNoHorizontalScroll(page, "página da matéria");

    await page.getByRole("button", { name: "Importar plano" }).click();
    const importer = page.getByRole("dialog", { name: "Importar plano de ensino" });
    await importer
      .getByLabel("Conteúdo")
      .fill("1. Aminoácidos\n2. Enzimas e cinética\n- Metabolismo\n\n2. Enzimas e cinética");
    await expect(importer.getByText("Prévia · 3")).toBeVisible();
    await importer.getByRole("button", { name: "Adicionar 3 tópicos" }).click();
    await expect(importer).toHaveCount(0);

    await page.getByRole("checkbox", { name: "Aminoácidos" }).click();
    await expect(page.getByRole("checkbox", { name: "Aminoácidos" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("33% do conteúdo revisado", { exact: false })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("checkbox", { name: "Aminoácidos" })).toHaveAttribute("aria-checked", "true");
    await page.goto("/materias");
    await expect(page.getByRole("link", { name: /Bioquímica/ })).toContainText("33%");
    await expect(page.getByRole("link", { name: /Bioquímica/ })).toContainText("Ter · 10h00");
  });

  test("avaliação aparece na pílula da matéria e no card do Início", async ({ page, account }) => {
    const subject = await seedSubject(account, { name: "Bioquímica", color: "rosa", icon: "flask-conical" });
    await page.goto(`/materias/${subject.id}`);
    await page.getByRole("tab", { name: "Avaliações" }).click();
    await page.getByRole("button", { name: "Nova avaliação" }).click();
    const sheet = page.getByRole("dialog", { name: "Nova avaliação" });
    await sheet.getByLabel("Nome").fill("P1");
    await sheet.getByLabel("Data").fill(formatDate(addDays(today(), 6)));
    await sheet.getByLabel("Conteúdo (opcional)").fill("enzimas e metabolismo");
    await sheet.getByRole("button", { name: "Salvar" }).click();
    // Exact: "Nenhuma avaliação marcada." is still on screen for a few ms when the toast appears.
    await expect(page.getByText("Avaliação marcada", { exact: true })).toBeVisible();

    await page.goto("/materias");
    await expect(page.getByRole("link", { name: /Bioquímica/ })).toContainText("P1 em 6 dias");
    await page.goto("/inicio");
    await expect(page.getByText("Próxima prova em 6 dias")).toBeVisible();
    await expect(page.getByText(/Bioquímica · P1 · enzimas e metabolismo/)).toBeVisible();
  });

  test("exame em destaque e avaliação concluída", async ({ page, account }) => {
    const subject = await seedSubject(account, { name: "Fisiologia", color: "pessego" });
    await seedAssessment(account, { subject_id: subject.id, title: "P1", kind: "prova", date: addDays(today(), 2) });
    await page.goto(`/materias/${subject.id}`);
    await page.getByRole("tab", { name: "Avaliações" }).click();
    await page.getByRole("button", { name: "Nova avaliação" }).click();
    const sheet = page.getByRole("dialog", { name: "Nova avaliação" });
    await sheet.getByLabel("Nome").fill("Exame final");
    await sheet.getByLabel("Tipo").selectOption({ label: "Exame (recuperação)" });
    // Impossible day, then the calendar.
    await sheet.getByLabel("Data").fill("31022027");
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect(sheet.getByText("Essa data não existe", { exact: false })).toBeVisible();
    await sheet.getByLabel("Data").fill(formatDate(today()));
    await sheet.getByRole("button", { name: "Abrir calendário" }).click();
    const examDay = addDays(today(), 5);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(sheet.getByRole("button", { name: spokenDate(examDay) })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(sheet.getByLabel("Data")).toHaveValue(formatDate(examDay));
    await expectNoHorizontalScroll(page, "nova avaliação");
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Avaliação marcada", { exact: true })).toBeVisible();

    const exam = page.getByRole("listitem").filter({ hasText: "Exame final" });
    await expect(exam).toContainText(`Exame · ${formatDate(examDay)}`);
    await expect(exam).toHaveClass(/bg-exam-tint/);

    await page.getByRole("checkbox", { name: "P1 concluída" }).click();
    const completed = page.getByRole("region", { name: "Avaliações concluídas" });
    await expect(completed.getByRole("checkbox", { name: "P1 concluída" })).toBeChecked();
    await expect
      .poll(async () => {
        const { data } = await adminClient().from("assessments").select("completed_at").eq("user_id", account.id);
        return data?.filter((a) => a.completed_at !== null).length;
      })
      .toBe(1);
    await page.reload();
    await page.getByRole("tab", { name: "Avaliações" }).click();
    await expect(completed.getByText("Concluída", { exact: true })).toBeVisible();
    await expectNoHorizontalScroll(page, "aba Avaliações");

    // The checked test is no longer the next one.
    await page.goto("/materias");
    await expect(page.getByRole("link", { name: /Fisiologia/ })).toContainText("Exame final em 5 dias");
    await page.goto("/inicio");
    await expect(page.getByText("Exame em 5 dias")).toBeVisible();
  });

  test("filtros e arquivar", async ({ page, account }) => {
    await seedSubject(account, { name: "Anatomia", color: "celeste" });
    const histo = await seedSubject(account, {
      name: "Histologia",
      color: "lilas",
      schedule_slots: [{ day: 1, start: "14:00", lab: true }],
    });
    await page.goto("/materias");
    await expect(page.getByRole("button", { name: "Com laboratório 1" })).toBeVisible();
    await page.getByRole("button", { name: "Com laboratório 1" }).click();
    await expect(page.getByRole("link", { name: /Histologia/ })).toContainText("Seg · 14h00 · lab");
    await expect(page.getByRole("link", { name: /Anatomia/ })).toHaveCount(0);

    await page.goto(`/materias/${histo.id}`);
    await page.getByRole("button", { name: "Opções da matéria" }).click();
    await page.getByRole("button", { name: "Arquivar" }).click();
    await expect(page.getByText("Matéria arquivada")).toBeVisible();
    await page.goto("/materias");
    await expect(page.getByRole("button", { name: "Todas 1" })).toBeVisible();
    await page.getByRole("button", { name: "Arquivadas 1" }).click();
    await expect(page.getByRole("link", { name: /Histologia/ })).toBeVisible();
  });

  test("reordenar tópicos com o teclado e manter depois de recarregar", async ({ page, account }) => {
    const subject = await seedSubject(account, { name: "Anatomia", color: "celeste" });
    await seedTopics(account, subject.id, ["Ossos", "Músculos", "Nervos"]);
    await page.goto(`/materias/${subject.id}`);
    const order = () => page.getByRole("checkbox").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
    await expect.poll(order).toEqual(["Ossos", "Músculos", "Nervos"]);

    await page.getByRole("button", { name: "Mover “Nervos”" }).focus();
    // Wait for each announcement (what a screen reader says) before the next key: with no gap, the
    // second arrow could arrive before dnd-kit had processed the first (4 of 8 runs; 0 of 24 at 50 ms).
    const announced = page.locator('[id^="DndLiveRegion"]');
    await page.keyboard.press("Space");
    await expect(announced).toContainText("sobre a posição de “Nervos”");
    await page.keyboard.press("ArrowUp");
    await expect(announced).toContainText("sobre a posição de “Músculos”");
    await page.keyboard.press("ArrowUp");
    await expect(announced).toContainText("sobre a posição de “Ossos”");
    await page.keyboard.press("Space");
    await expect.poll(order).toEqual(["Nervos", "Ossos", "Músculos"]);

    await expect
      .poll(async () => {
        const { data } = await adminClient()
          .from("subject_topics")
          .select("title")
          .eq("subject_id", subject.id)
          .order("position");
        return data?.map((t) => t.title);
      })
      .toEqual(["Nervos", "Ossos", "Músculos"]);
    await page.reload();
    await expect.poll(order).toEqual(["Nervos", "Ossos", "Músculos"]);
  });
});

test.describe("Início", () => {
  test("metas: criar, concluir, desmarcar e mover uma atrasada para hoje", async ({ page, account }) => {
    const subject = await seedSubject(account, { name: "Imunologia", color: "verde" });
    await seedGoal(account, {
      title: "Ler artigo de ontem",
      date: addDays(today(), -1),
      duration_min: 40,
      subject_id: subject.id,
    });
    await page.goto("/inicio");

    const card = page.locator("section", { has: page.getByRole("heading", { name: "Metas de hoje" }) });
    await expect(card.getByText("de ontem", { exact: true })).toBeVisible();
    await card.getByRole("button", { name: "Mover para hoje" }).click();
    await expect(card.getByText("de ontem", { exact: true })).toHaveCount(0);
    await expect(card.getByRole("checkbox", { name: "Ler artigo de ontem" })).toBeVisible();

    await card.getByRole("button", { name: "Nova meta" }).click();
    const sheet = page.getByRole("dialog", { name: "Nova meta" });
    await sheet.getByLabel("Meta").fill("Revisar imunidade inata");
    await sheet.getByLabel("Matéria (opcional)").selectOption({ label: "Imunologia" });
    await sheet.getByRole("button", { name: "45 min" }).click();
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect(card.getByRole("checkbox", { name: "Revisar imunidade inata" })).toBeVisible();
    await expect(card.getByText("45 min")).toBeVisible();

    // A duration saved before that isn't one of the choices (40 min) isn't lost on editing.
    await card.getByRole("button", { name: "Editar “Ler artigo de ontem”" }).click();
    const edit = page.getByRole("dialog", { name: "Editar meta" });
    await expect(edit.getByRole("button", { name: "40 min" })).toHaveAttribute("aria-pressed", "true");
    await expect(edit.getByLabel("Dia")).toHaveValue(formatDate(today()));
    await expect(edit.getByRole("spinbutton")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(edit).toHaveCount(0);

    // Fixed time, typed in 24 hours.
    await card.getByRole("button", { name: "Nova meta" }).click();
    await sheet.getByLabel("Meta").fill("Reunião da extensão");
    await sheet.getByRole("radio", { name: "Horário marcado" }).click();
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect(sheet.getByText("Use o formato 16:00.")).toBeVisible();
    await sheet.getByLabel("Horário", { exact: true }).pressSequentially("1630");
    await expect(sheet.getByLabel("Horário", { exact: true })).toHaveValue("16:30");
    await sheet.getByRole("button", { name: "Salvar" }).click();
    await expect(card.getByText("16h30")).toBeVisible();

    const weekMetric = page.getByText("Metas da semana").locator("..");
    await expect(weekMetric).toContainText("0 de 3");
    await card.getByRole("checkbox", { name: "Revisar imunidade inata" }).click();
    await expect(weekMetric).toContainText("1 de 3");
    await card.getByRole("checkbox", { name: "Revisar imunidade inata" }).click();
    await expect(weekMetric).toContainText("0 de 3");
    await expectNoHorizontalScroll(page, "/inicio");
  });

  test("quadro de próximas provas: em ordem, sem seminários, concluídas nem arquivadas", async ({ page, account }) => {
    const bio = await seedSubject(account, { name: "Bioquímica", color: "turquesa" });
    const old = await seedSubject(account, { name: "Antiga", color: "lima", archived: true });
    const at = (days: number) => addDays(today(), days);
    await seedAssessment(account, { subject_id: bio.id, title: "P2", kind: "pratica", date: at(9) });
    await seedAssessment(account, { subject_id: bio.id, title: "Exame final", kind: "exame", date: at(1) });
    await seedAssessment(account, { subject_id: bio.id, title: "Seminário", kind: "seminario", date: at(2) });
    await seedAssessment(account, { subject_id: bio.id, title: "Passou", kind: "prova", date: at(-1) });
    await seedAssessment(account, { subject_id: old.id, title: "Arquivada", kind: "prova", date: at(3) });
    await seedAssessment(account, {
      subject_id: bio.id,
      title: "Feita",
      kind: "prova",
      date: at(4),
      completed_at: new Date().toISOString(),
    });
    await page.goto("/inicio");
    const board = page.getByRole("region", { name: "Próximas provas" });
    await expect(board.getByRole("listitem")).toHaveCount(2);
    await expect(board.getByRole("listitem").nth(0)).toContainText("Exame final");
    await expect(board.getByRole("listitem").nth(0)).toContainText("amanhã");
    await expect(board.getByRole("listitem").nth(1)).toContainText("P2");
    await expect(board.getByRole("listitem").nth(1)).toContainText(formatDate(at(9)));
    await expectNoHorizontalScroll(page, "/inicio com o quadro");
    await board.getByRole("link", { name: /Exame final/ }).click();
    await expect(page).toHaveURL(new RegExp(`/materias/${bio.id}$`));
  });

  test("o texto da busca cabe no campo", async ({ page, account }) => {
    void account;
    await page.goto("/inicio");
    const search = page.getByRole("searchbox");
    await expect(search).toBeVisible();
    const { text, room } = await search.evaluate((el: HTMLInputElement) => {
      const style = getComputedStyle(el);
      const context = document.createElement("canvas").getContext("2d")!;
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      return { text: context.measureText(el.placeholder).width, room: el.clientWidth };
    });
    expect(text, `placeholder de ${Math.round(text)}px num campo de ${room}px`).toBeLessThanOrEqual(room);
  });

  test("continuar estudando e busca sem acento", async ({ page, account }) => {
    const subject = await seedSubject(account, { name: "Bioquímica", color: "rosa", icon: "flask-conical" });
    await seedTopics(account, subject.id, ["Aminoácidos", "Enzimas e cinética"]);
    await page.goto("/inicio");
    const continueCard = page.locator("section", { has: page.getByRole("heading", { name: "Continuar estudando" }) });
    await expect(continueCard.getByRole("link", { name: /Bioquímica/ })).toContainText("Aminoácidos");

    await page.getByRole("searchbox").fill("cinetica");
    const results = page.getByRole("region", { name: "Resultados da busca" });
    await expect(results.getByRole("link", { name: /Enzimas e cinética/ })).toBeVisible();
    await results.getByRole("link", { name: /Enzimas e cinética/ }).click();
    await expect(page).toHaveURL(new RegExp(`/materias/${subject.id}$`));
  });
});
