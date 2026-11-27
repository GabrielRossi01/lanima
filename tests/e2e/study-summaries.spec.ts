import type { Page } from "@playwright/test";
import { adminClient, liftAppAiCap, seedAiUsage, seedReading, seedSubject, type TestAccount } from "./helpers/accounts";
import { expect, test } from "./helpers/fixtures";
import { PAGES, seedSummary } from "./helpers/study";

// Summaries in topics (section 7.5), with the simulated AI provider (playwright.config.ts).

test.beforeAll(liftAppAiCap);

async function summaries(account: TestAccount) {
  const { data, error } = await adminClient().from("summaries").select("*").eq("user_id", account.id);
  if (error) throw error;
  return data;
}

async function usage(account: TestAccount) {
  const { data, error } = await adminClient().from("ai_usage").select("operation, status").eq("user_id", account.id);
  if (error) throw error;
  return data;
}

/**
 * Moves a point one place up with the keyboard. Each key waits for dnd-kit's announcement: with no
 * gap the arrow can arrive before the drag started (same lesson as subjects.spec).
 */
async function movePointUp(page: Page, number: string) {
  const [topic, point] = number.split(".").map(Number);
  const above = `${topic}.${point - 1}`;
  // One live region per list of points: the one that speaks is the one with the text.
  const announced = (text: string) => page.locator('[id^="DndLiveRegion"]', { hasText: text });
  await page.getByRole("button", { name: `Mover o ponto ${number}` }).focus();
  await page.keyboard.press("Space");
  await expect(announced(`Ponto ${number} sobre a posição ${number}`)).toBeAttached();
  await page.keyboard.press("ArrowUp");
  await expect(announced(`Ponto ${number} sobre a posição ${above}`)).toBeAttached();
  await page.keyboard.press("Space");
  await expect(announced(`Ponto ${number} solto na posição ${above}`)).toBeAttached();
}

async function newSummary(page: Page, fileName: string) {
  await page.goto("/estudo");
  await page.getByRole("button", { name: "Novo resumo" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Novo resumo" });
  await sheet.getByRole("checkbox", { name: new RegExp(fileName) }).check();
  await sheet.getByRole("radio", { name: "Completo" }).click();
  await sheet.getByRole("button", { name: "Gerar resumo" }).click();
  return sheet;
}

test.describe("Resumos", () => {
  test("gera um resumo com fontes, depois do aviso de privacidade; o mesmo pedido não gasta de novo", async ({
    page,
    account,
  }) => {
    const subject = await seedSubject(account, { name: "Anatomia", color: "celeste" });
    await seedReading(account, { name: "Slides Esqueleto.pdf", subjectId: subject.id, pages: PAGES });

    await page.goto("/estudo");
    await expect(page.getByRole("heading", { name: "Nenhum resumo ainda" })).toBeVisible();
    await expect(page.getByText("Restam 25 gerações hoje")).toBeVisible();
    await newSummary(page, "Slides Esqueleto");

    // First time: the privacy notice (section 7.12).
    const notice = page.getByRole("dialog", { name: "Antes de usar a IA" });
    await expect(notice).toContainText("Não envie dados pessoais ou de pacientes.");
    await notice.getByRole("button", { name: "Entendi" }).click();

    await expect(page).toHaveURL(/\/estudo\/resumo\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: "Sistema esquelético" })).toBeVisible();
    const first = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("button", { name: /^1 Sistema esquelético/ }) });
    await expect(first.getByText("O esqueleto humano adulto tem 206 ossos.")).toBeVisible();
    await expect(first.getByRole("button", { name: "Abrir fonte: Slides Esqueleto · p. 1" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^3 Ossificação/ })).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("heading", { name: "Termos-chave" })).toBeVisible();
    await expect(
      page.getByText("Gerado por IA a partir dos seus arquivos. Confira com o material da aula."),
    ).toBeVisible();

    const [saved] = await summaries(account);
    expect(saved).toMatchObject({
      subject_id: subject.id,
      detail: "completo",
      provider: "mock",
      edited_by_user: false,
    });
    expect(await usage(account)).toEqual([{ operation: "resumo", status: "ok" }]);
    const { data: profile } = await adminClient()
      .from("profiles")
      .select("ai_notice_accepted_at")
      .eq("id", account.id)
      .single();
    expect(profile?.ai_notice_accepted_at).not.toBeNull();

    // The same request again: no notice, the same summary, no quota spent.
    const url = page.url();
    await newSummary(page, "Slides Esqueleto");
    await expect(page).toHaveURL(url);
    expect(await summaries(account)).toHaveLength(1);
    expect(await usage(account)).toHaveLength(1);
    await page.goto("/estudo");
    await expect(page.getByRole("link", { name: /Sistema esquelético/ })).toContainText("3 tópicos · 1 arquivo · hoje");
    await expect(page.getByText("Restam 24 gerações hoje")).toBeVisible();
  });

  test("marca-texto, edição, reordenação e um ponto escrito à mão", async ({ page, account }) => {
    await openNewSummary(page, account, "Enzimas");

    // Highlighter: tap the point, pick a color.
    const point = page.getByRole("button", {
      name: "Destacar com marca-texto: O esqueleto humano adulto tem 206 ossos.",
    });
    await point.click();
    await page.getByRole("dialog", { name: "Marca-texto" }).getByRole("button", { name: "Rosa" }).click();
    await expect(point).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(async () => (await summaries(account))[0].content)
      .toMatchObject({
        topicos: [{ pontos: [{ texto: "O esqueleto humano adulto tem 206 ossos.", destaque: "rosa" }, {}] }, {}, {}],
      });

    await page.getByRole("button", { name: "Editar resumo" }).click();
    // Edit the text of 1.2.
    await page.getByRole("button", { name: "Editar o ponto 1.2" }).click();
    await page
      .getByLabel("Texto do ponto 1.2")
      .fill("O esqueleto axial reúne 80 ossos: crânio, coluna, costelas e esterno.");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    // Move 1.2 above 1.1 with the keyboard (Space, arrow, Space).
    await movePointUp(page, "1.2");
    // A point of her own in the first topic.
    await page.getByRole("button", { name: "+ Adicionar ponto" }).first().click();
    await page.getByPlaceholder("Adicionar ponto").fill("Revisar a lista dos ossos do crânio.");
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await page.getByRole("button", { name: "Concluir edição" }).click();

    await expect
      .poll(async () => (await summaries(account))[0])
      .toMatchObject({
        edited_by_user: true,
        content: {
          topicos: [
            {
              pontos: [
                {
                  texto: "O esqueleto axial reúne 80 ossos: crânio, coluna, costelas e esterno.",
                  fonte: { pagina: 1 },
                },
                { texto: "O esqueleto humano adulto tem 206 ossos.", destaque: "rosa" },
                { texto: "Revisar a lista dos ossos do crânio.", fonte: null },
              ],
            },
            {},
            {},
          ],
        },
      });
    await expect(page.getByText("seu ponto")).toBeVisible();

    // Edited: "Gerar de novo" asks first, and Cancelar keeps everything.
    await page.getByRole("button", { name: "Gerar de novo" }).click();
    const confirm = page.getByRole("dialog", { name: "Gerar de novo?" });
    await expect(confirm).toContainText("Você editou este resumo.");
    await confirm.getByRole("button", { name: "Cancelar" }).click();
    expect(await usage(account)).toHaveLength(0);
  });

  test("gerar de novo troca o conteúdo e conta uma geração", async ({ page, account }) => {
    await seedReading(account, { name: "Ossos.pdf", pages: PAGES });
    await adminClient()
      .from("profiles")
      .update({ ai_notice_accepted_at: new Date().toISOString() })
      .eq("id", account.id);
    await newSummary(page, "Ossos");
    await expect(page).toHaveURL(/\/estudo\/resumo\//);
    await page.getByRole("button", { name: "Gerar de novo" }).click();
    await expect(page.getByText("Resumo gerado de novo")).toBeVisible();
    await expect.poll(async () => (await summaries(account))[0].version).toBe(2);
    expect(await summaries(account)).toHaveLength(1);
    expect(await usage(account)).toHaveLength(2);
  });

  test("limite do dia: avisa e não deixa gerar", async ({ page, account }) => {
    await seedReading(account, { name: "Limite.pdf", pages: PAGES });
    await seedAiUsage(account, "resumo", 10);
    await page.goto("/estudo");
    await page.getByRole("button", { name: "Novo resumo" }).first().click();
    const sheet = page.getByRole("dialog", { name: "Novo resumo" });
    await expect(sheet.getByText("Nenhuma geração restante hoje")).toBeVisible();
    await expect(sheet.getByText("Você usou as gerações de hoje")).toBeVisible();
    await sheet.getByRole("checkbox", { name: /Limite/ }).check();
    await expect(sheet.getByRole("button", { name: "Gerar resumo" })).toBeDisabled();
  });

  test("arquivo ainda sendo lido não pode ser marcado", async ({ page, account }) => {
    const { documentId } = await seedReading(account, { name: "Lendo.pdf", pages: PAGES });
    await adminClient().from("documents").update({ status: "extraindo" }).eq("id", documentId);
    await page.goto("/estudo");
    await page.getByRole("button", { name: "Novo resumo" }).first().click();
    const sheet = page.getByRole("dialog", { name: "Novo resumo" });
    await expect(sheet.getByRole("checkbox", { name: /Lendo\.pdf/ })).toBeDisabled();
    await expect(sheet.getByRole("button", { name: "Gerar resumo" })).toBeDisabled();
  });
});

/**
 * A summary already saved (what the simulated AI makes from PAGES), opened. Written straight to the
 * database: the edit tests check editing, and stay clear of the generation request (covered above).
 */
async function openNewSummary(page: Page, account: TestAccount, fileName: string) {
  const { summaryId } = await seedSummary(account, { fileName });
  await page.goto(`/estudo/resumo/${summaryId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Sistema esquelético" })).toBeVisible();
}

/** Texts of the points of a topic, in order, as the screen shows them. */
function pointTexts(page: Page, topic: number) {
  return page
    .locator("main ol > li")
    .nth(topic - 1)
    .getByRole("button", { name: /^Destacar com marca-texto: / })
    .evaluateAll((buttons) => buttons.map((b) => b.textContent?.trim() ?? ""));
}

test.describe("Edições do resumo", () => {
  test("“Salvando…” e “Salvo” não mexem na lista (um arraste em curso não perde o lugar)", async ({
    page,
    account,
  }) => {
    await openNewSummary(page, account, "Enzimas");
    // A slow answer, so "Salvando…" stays on screen long enough to measure.
    let release!: () => void;
    const answered = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/rest\/v1\/summaries\?id=/, async (route) => {
      if (route.request().method() === "PATCH") await answered;
      await route.continue();
    });
    const list = page.locator("main ol > li").first();
    const top = async () => (await list.boundingBox())!.y;
    const before = await top();

    await page
      .getByRole("button", { name: "Destacar com marca-texto: O esqueleto humano adulto tem 206 ossos." })
      .click();
    await page.getByRole("dialog", { name: "Marca-texto" }).getByRole("button", { name: "Rosa" }).click();
    await expect(page.getByRole("status").filter({ hasText: /^Salvando…$/ })).toBeVisible();
    // "editado por você" appears with the first edit: the header may change once, here.
    const saving = await top();
    release();
    await expect(page.getByRole("status").filter({ hasText: /^Salvo$/ })).toBeVisible();
    expect(await top()).toBe(saving);
    expect(Math.abs(saving - before)).toBeLessThan(30);
  });

  test("5 edições rápidas seguidas ficam todas salvas depois de recarregar", async ({ page, account }) => {
    await openNewSummary(page, account, "Rapidas");

    // No waiting between them: highlight, edit, move, delete, add.
    await page
      .getByRole("button", { name: "Destacar com marca-texto: O esqueleto humano adulto tem 206 ossos." })
      .click();
    await page.getByRole("dialog", { name: "Marca-texto" }).getByRole("button", { name: "Amarelo" }).click();
    await page.getByRole("button", { name: "Editar resumo" }).click();
    await page.getByRole("button", { name: "Editar o ponto 1.2" }).click();
    await page.getByLabel("Texto do ponto 1.2").fill("Axial: 80 ossos.");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await movePointUp(page, "1.2");
    await page.getByRole("button", { name: "Excluir o ponto 2.2" }).click();
    await page.getByRole("button", { name: "+ Adicionar ponto" }).first().click();
    await page.getByPlaceholder("Adicionar ponto").fill("Revisar o crânio.");
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: /^Salvo$/ })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Sistema esquelético" })).toBeVisible();
    await expect
      .poll(() => pointTexts(page, 1))
      .toEqual(["Axial: 80 ossos.", "O esqueleto humano adulto tem 206 ossos.", "Revisar o crânio."]);
    await expect(
      page.getByRole("button", { name: "Destacar com marca-texto: O esqueleto humano adulto tem 206 ossos." }),
    ).toHaveAttribute("aria-pressed", "true");
    // The first two topics open by themselves.
    await expect.poll(() => pointTexts(page, 2)).toEqual(["Os osteoblastos produzem a matriz óssea."]);

    const [saved] = (
      await adminClient().from("summaries").select("content, version, edited_by_user").eq("user_id", account.id)
    ).data!;
    expect(saved).toMatchObject({
      edited_by_user: true,
      content: {
        topicos: [
          {
            pontos: [
              { texto: "Axial: 80 ossos." },
              { texto: "O esqueleto humano adulto tem 206 ossos.", destaque: "amarelo" },
              { texto: "Revisar o crânio.", fonte: null },
            ],
          },
          { pontos: [{ texto: "Os osteoblastos produzem a matriz óssea." }] },
          {},
        ],
      },
    });
    // One version per save that reached the server, never fewer than one.
    expect(saved.version).toBeGreaterThan(1);
  });

  test("mudou em outro aparelho: não sobrescreve, mostra a versão de lá e avisa", async ({ page, account }) => {
    await openNewSummary(page, account, "Conflito");
    const [row] = (await adminClient().from("summaries").select("id, content, version").eq("user_id", account.id))
      .data!;
    // Another device renames the summary (version goes up there).
    const other = { ...(row.content as Record<string, unknown>), titulo: "Esqueleto (editado no iPad)" };
    await adminClient()
      .from("summaries")
      .update({ content: other, title: other.titulo as string, version: row.version + 1 })
      .eq("id", row.id);

    await page
      .getByRole("button", { name: "Destacar com marca-texto: O esqueleto humano adulto tem 206 ossos." })
      .click();
    await page.getByRole("dialog", { name: "Marca-texto" }).getByRole("button", { name: "Verde" }).click();
    await expect(page.getByText("Este resumo mudou em outro aparelho")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Esqueleto (editado no iPad)" })).toBeVisible();
    const after = (await adminClient().from("summaries").select("content, version").eq("id", row.id).single()).data!;
    expect(after.version).toBe(row.version + 1);
    expect(JSON.stringify(after.content)).not.toContain("verde");
  });

  test("offline: a edição espera no aparelho e sobe quando a rede volta, mesmo recarregando", async ({
    page,
    context,
    account,
  }) => {
    await openNewSummary(page, account, "Offline");
    await context.setOffline(true);
    await page
      .getByRole("button", { name: "Destacar com marca-texto: O esqueleto humano adulto tem 206 ossos." })
      .click();
    await page.getByRole("dialog", { name: "Marca-texto" }).getByRole("button", { name: "Lilás" }).click();
    await expect(page.getByText("Offline · será sincronizado")).toBeVisible();
    const id = page.url().split("/").at(-1)!;
    expect(
      JSON.stringify((await adminClient().from("summaries").select("content").eq("id", id).single()).data!.content),
    ).not.toContain("lilas");

    // The network comes back and the page is opened again: what waited on the device goes up.
    await context.setOffline(false);
    await page.waitForFunction(() => navigator.onLine);
    await page.goto(page.url());
    await expect
      .poll(async () =>
        JSON.stringify((await adminClient().from("summaries").select("content").eq("id", id).single()).data!.content),
      )
      .toContain("lilas");
    await expect(
      page.getByRole("button", { name: "Destacar com marca-texto: O esqueleto humano adulto tem 206 ossos." }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("Edições do resumo: falha do servidor", () => {
  // page.route() can't see requests made by the service worker, which handles the Supabase calls.
  test.use({ serviceWorkers: "block" });

  test("uma falha não desfaz as edições que deram certo; avisa e mostra o que está no servidor", async ({
    page,
    account,
  }) => {
    await openNewSummary(page, account, "Falha");
    // First edit goes through.
    await page
      .getByRole("button", { name: "Destacar com marca-texto: O esqueleto humano adulto tem 206 ossos." })
      .click();
    await page.getByRole("dialog", { name: "Marca-texto" }).getByRole("button", { name: "Rosa" }).click();
    await expect(page.getByRole("status").filter({ hasText: /^Salvo$/ })).toBeVisible();
    // The next one is refused by the server.
    await page.route("**/rest/v1/summaries**", (route) =>
      route.request().method() === "PATCH"
        ? route.fulfill({ status: 500, json: { code: "XX000", message: "falhou" } })
        : route.fallback(),
    );
    await page.getByRole("button", { name: "Destacar com marca-texto: O esqueleto axial reúne 80 ossos." }).click();
    await page.getByRole("dialog", { name: "Marca-texto" }).getByRole("button", { name: "Verde" }).click();
    await expect(page.getByText("Não foi possível salvar a última alteração")).toBeVisible();
    // The server copy: the first edit stays, the refused one is gone.
    await expect(
      page.getByRole("button", { name: "Destacar com marca-texto: O esqueleto humano adulto tem 206 ossos." }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", { name: "Destacar com marca-texto: O esqueleto axial reúne 80 ossos." }),
    ).toHaveAttribute("aria-pressed", "false");
  });
});
