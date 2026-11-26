import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { adminClient, seedSubject, type TestAccount } from "./helpers/accounts";
import { expect, test } from "./helpers/fixtures";
import { describeHorizontalOverflow } from "./helpers/overflow";

const fixture = (name: string) => join(__dirname, "..", "fixtures", "files", name);

/** The picker of "Escolher arquivos" (a hidden input with a visible label). */
const picker = (page: Page) => page.getByLabel("Escolher arquivos");
const camera = (page: Page) => page.getByLabel("Tirar foto");

/** The row (tablet) or item (phone) of a file. */
function fileRow(page: Page, name: string): Locator {
  return page
    .locator("tr, li")
    .filter({ has: page.getByRole("button", { name, exact: true }) })
    .locator("visible=true");
}

/** Opens Arquivos and waits for the list: until then, the picker is disabled. */
async function gotoFiles(page: Page) {
  await page.goto("/arquivos");
  await expect(picker(page)).toBeEnabled();
}

async function openActions(page: Page, name: string): Promise<Locator> {
  await page
    .getByRole("button", { name: `Ações: ${name}` })
    .locator("visible=true")
    .click();
  const sheet = page.getByRole("dialog", { name });
  await expect(sheet).toBeVisible();
  return sheet;
}

async function openText(page: Page, name: string): Promise<Locator> {
  const actions = await openActions(page, name);
  await actions.getByRole("button", { name: "Ver texto" }).click();
  const sheet = page.getByRole("dialog", { name: `Texto de ${name}` });
  await expect(sheet).toBeVisible();
  return sheet;
}

async function ready(page: Page, name: string, timeout = 30_000) {
  await expect(fileRow(page, name).getByText("Pronto para resumir")).toBeVisible({ timeout });
}

async function storedFiles(account: TestAccount) {
  const { data, error } = await adminClient()
    .from("files")
    .select("*, documents(*, document_chunks(page, text, position))")
    .eq("user_id", account.id)
    .order("created_at");
  if (error) throw error;
  return data;
}

async function storedObjects(account: TestAccount) {
  const { data, error } = await adminClient().storage.from("files").list(account.id);
  if (error) throw error;
  return data.map((o) => o.name);
}

test.describe("Arquivos", () => {
  test("PDF de slides: enviado, lido por página, e a escolha das páginas fica salva", async ({ page, account }) => {
    await gotoFiles(page);
    await expect(page.getByRole("heading", { name: "Nenhum arquivo ainda" })).toBeVisible();
    await picker(page).setInputFiles(fixture("anatomia-slides.pdf"));
    await expect(page.getByText("Arquivo enviado")).toBeVisible();
    await ready(page, "anatomia-slides.pdf");
    await expect(fileRow(page, "anatomia-slides.pdf").getByText("3 KB")).toBeVisible();

    const [row] = await storedFiles(account);
    expect(row).toMatchObject({ kind: "pdf", mime_type: "application/pdf", storage_path: `${account.id}/${row.id}` });
    expect(row.uploaded_at).not.toBeNull();
    expect(await storedObjects(account)).toEqual([row.id]);
    const document = row.documents[0];
    expect(document).toMatchObject({ status: "pronto", page_count: 3, used_ocr: false, pages_approx: false });
    expect(document.document_chunks.map((c) => c.page).sort()).toEqual([1, 2, 3]);

    const text = await openText(page, "anatomia-slides.pdf");
    await expect(text.getByText("3 páginas · 3 de 3 com texto usadas nos resumos e testes")).toBeVisible();
    const first = text.getByRole("listitem", { name: "Página 1" });
    await expect(first).toContainText("O esqueleto axial tem 80 ossos.");
    await expect(text.getByRole("listitem", { name: "Página 3" })).toContainText("Caixa torácica");
    await first.getByRole("switch", { name: "Usar nos resumos" }).click();
    await expect(text.getByText("2 de 3 com texto usadas")).toBeVisible();
    await expect.poll(async () => (await storedFiles(account))[0].documents[0].excluded_pages).toEqual([1]);

    await page.reload();
    const again = await openText(page, "anatomia-slides.pdf");
    await expect(again.getByRole("listitem", { name: "Página 1" }).getByRole("switch")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect(again.getByRole("listitem", { name: "Página 2" }).getByRole("switch")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("Word e slides: páginas que o Word salvou e slides na ordem, com as notas", async ({ page, account }) => {
    void account;
    await gotoFiles(page);
    await picker(page).setInputFiles([fixture("bioquimica-word.docx"), fixture("imunologia-aula.pptx")]);
    await expect(page.getByText("2 arquivos enviados")).toBeVisible();
    await ready(page, "bioquimica-word.docx");
    await ready(page, "imunologia-aula.pptx");

    const word = await openText(page, "bioquimica-word.docx");
    await expect(word.getByRole("listitem", { name: "Página 2" })).toContainText("produz piruvato.");
    await expect(word.getByText("aproximadas")).toHaveCount(0);
    await word.getByRole("button", { name: "Fechar" }).click();

    const slides = await openText(page, "imunologia-aula.pptx");
    await expect(slides.getByRole("listitem", { name: "Slide 1" })).toContainText("Imunologia · Aula 2");
    await expect(slides.getByRole("listitem", { name: "Slide 2" })).toContainText(
      "Lembrar: a febre também é defesa inata.",
    );
  });

  test("Word sem marcas de página: páginas aproximadas, com aviso", async ({ page, account }) => {
    void account;
    await gotoFiles(page);
    await picker(page).setInputFiles(fixture("membrana-sem-marcas.docx"));
    await ready(page, "membrana-sem-marcas.docx");
    const text = await openText(page, "membrana-sem-marcas.docx");
    await expect(text.getByText("Este Word não guardou as páginas")).toBeVisible();
    await expect(text.getByRole("listitem", { name: "Pág. ≈2" })).toContainText("Parágrafo 12.");
  });

  test("foto de página de livro: comprimida, guardada e lida por OCR", async ({ page, account }) => {
    test.setTimeout(150_000);
    await gotoFiles(page);
    await camera(page).setInputFiles(fixture("livro-pagina.png"));
    const name = /^livro-pagina\.(webp|jpg)$/;
    await expect(page.getByRole("button", { name }).locator("visible=true")).toBeVisible();
    const [row] = await storedFiles(account);
    expect(row.kind).toBe("foto");
    expect(["image/webp", "image/jpeg"]).toContain(row.mime_type);
    expect(row.size_bytes).toBeLessThanOrEqual(400 * 1024);
    await expect(
      page
        .locator("tr, li")
        .filter({ has: page.getByRole("button", { name }) })
        .locator("visible=true")
        .getByText("Pronto para resumir"),
    ).toBeVisible({ timeout: 120_000 });
    const text = await openText(page, row.name);
    await expect(text.getByText("Lido de imagem (OCR)")).toBeVisible();
    await expect(text.getByRole("listitem", { name: "Foto" })).toContainText("substrato específico no sítio ativo");
  });

  test("PDF escaneado: só a página sem texto vai para o OCR", async ({ page, account }) => {
    test.setTimeout(150_000);
    await gotoFiles(page);
    await picker(page).setInputFiles(fixture("bioquimica-escaneada.pdf"));
    await ready(page, "bioquimica-escaneada.pdf", 120_000);
    const text = await openText(page, "bioquimica-escaneada.pdf");
    await expect(text.getByRole("listitem", { name: "Página 1" })).toContainText("Apostila de Bioquímica");
    await expect(text.getByRole("listitem", { name: "Página 2" })).toContainText("As enzimas são proteínas");
    expect((await storedFiles(account))[0].documents[0].used_ocr).toBe(true);
  });

  test("o mesmo arquivo de novo só avisa; tipos antigos e mais de 25 MB são recusados", async ({ page, account }) => {
    await gotoFiles(page);
    await picker(page).setInputFiles(fixture("anatomia-slides.pdf"));
    await expect(page.getByText("Arquivo enviado")).toBeVisible();
    await expect(fileRow(page, "anatomia-slides.pdf")).toBeVisible();
    await picker(page).setInputFiles({
      name: "copia.pdf",
      mimeType: "application/pdf",
      buffer: await readFixture("anatomia-slides.pdf"),
    });
    await expect(page.getByText("Você já enviou este arquivo")).toBeVisible();
    await expect(page.getByText("copia.pdf já está em Arquivos, como “anatomia-slides.pdf”.")).toBeVisible();

    await picker(page).setInputFiles([
      { name: "velho.doc", mimeType: "application/msword", buffer: Buffer.from("x") },
      { name: "grande.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(26 * 1024 * 1024, 1) },
    ]);
    await expect(page.getByText("2 arquivos não foram enviados")).toBeVisible();
    await expect(page.getByText(/velho\.doc: Arquivo \.doc antigo: abra no Word e salve como \.docx\./)).toBeVisible();
    await expect(page.getByText(/grande\.pdf: Tem 26 MB: o limite é de 25 MB por arquivo\./)).toBeVisible();
    expect(await storedFiles(account)).toHaveLength(1);
  });

  test("renomear, mudar de matéria, filtrar e excluir", async ({ page, account }) => {
    await seedSubject(account, { name: "Anatomia", color: "verde" });
    await gotoFiles(page);
    await picker(page).setInputFiles(fixture("anatomia-slides.pdf"));
    await ready(page, "anatomia-slides.pdf");

    let actions = await openActions(page, "anatomia-slides.pdf");
    await expect(actions.getByRole("link", { name: "Abrir" })).toHaveAttribute(
      "href",
      /\/storage\/v1\/object\/sign\/files\//,
    );
    await expect(actions.getByRole("link", { name: "Baixar" })).toHaveAttribute("href", /download=/);
    await actions.getByRole("button", { name: "Renomear" }).click();
    const rename = page.getByRole("dialog", { name: "Renomear arquivo" });
    await expect(rename.getByLabel("Nome")).toHaveValue("anatomia-slides");
    await rename.getByLabel("Nome").fill("Aula 7 · Esqueleto");
    await rename.getByRole("button", { name: "Salvar" }).click();
    await expect(fileRow(page, "Aula 7 · Esqueleto.pdf")).toBeVisible();

    actions = await openActions(page, "Aula 7 · Esqueleto.pdf");
    await actions.getByRole("button", { name: "Mudar de matéria" }).click();
    await page.getByRole("dialog", { name: "Mudar de matéria" }).getByRole("button", { name: "Anatomia" }).click();
    await expect(fileRow(page, "Aula 7 · Esqueleto.pdf").getByText("Anatomia")).toBeVisible();
    await page.getByLabel("Matéria:").selectOption({ label: "Sem matéria" });
    await expect(page.getByRole("heading", { name: "Nenhum arquivo neste filtro" })).toBeVisible();
    await page.getByLabel("Matéria:").selectOption({ label: "Anatomia" });
    await page.getByRole("button", { name: /^Fotos/ }).click();
    await expect(page.getByRole("heading", { name: "Nenhum arquivo neste filtro" })).toBeVisible();
    await page.getByRole("button", { name: /^PDFs/ }).click();

    actions = await openActions(page, "Aula 7 · Esqueleto.pdf");
    await actions.getByRole("button", { name: "Excluir" }).click();
    const confirm = page.getByRole("dialog", { name: "Excluir arquivo?" });
    await confirm.getByRole("button", { name: "Excluir" }).click();
    await expect(page.getByRole("heading", { name: "Nenhum arquivo ainda" })).toBeVisible();
    await expect.poll(() => storedFiles(account)).toEqual([]);
    expect(await storedObjects(account)).toEqual([]);
  });

  test("selecionar vários e excluir juntos; o espaço usado acompanha", async ({ page, account }) => {
    await gotoFiles(page);
    await picker(page).setInputFiles([fixture("anatomia-slides.pdf"), fixture("imunologia-aula.pptx")]);
    await ready(page, "anatomia-slides.pdf");
    await ready(page, "imunologia-aula.pptx");
    const storage = page.getByRole("complementary", { name: "Espaço, importação e exportação" });
    await expect(storage.getByText("10 KB")).toBeVisible();
    await page.getByRole("checkbox", { name: "Selecionar anatomia-slides.pdf" }).locator("visible=true").check();
    await page.getByRole("checkbox", { name: "Selecionar imunologia-aula.pptx" }).locator("visible=true").check();
    const bar = page.getByRole("region", { name: "Arquivos selecionados" });
    await expect(bar.getByText("2 selecionados")).toBeVisible();
    await bar.getByRole("button", { name: "Excluir" }).click();
    await page.getByRole("dialog", { name: "Excluir 2 arquivos?" }).getByRole("button", { name: "Excluir" }).click();
    await expect(page.getByRole("heading", { name: "Nenhum arquivo ainda" })).toBeVisible();
    await expect(storage.getByText("0 B")).toBeVisible();
    await expect.poll(() => storedFiles(account)).toEqual([]);
    expect(await storedObjects(account)).toEqual([]);
    await expectNoHorizontalScroll(page);
  });

  test("com o espaço cheio, o banco recusa e o aviso diz por quê", async ({ page, account }) => {
    // 249,99 MB already used, registered straight in the database.
    const rows = Array.from({ length: 10 }, (_, i) => {
      const id = randomUUID();
      return {
        id,
        user_id: account.id,
        name: `Parte ${i + 1}.pdf`,
        kind: "pdf",
        mime_type: "application/pdf",
        size_bytes: i < 9 ? 26_214_400 : 26_214_400 - 1000,
        storage_path: `${account.id}/${id}`,
        sha256: String(i).repeat(64).slice(0, 64),
        uploaded_at: new Date().toISOString(),
      };
    });
    const { error } = await adminClient().from("files").insert(rows);
    if (error) throw error;
    await gotoFiles(page);
    await expect(
      page.getByRole("complementary", { name: "Espaço, importação e exportação" }).getByText("250 MB", { exact: true }),
    ).toBeVisible();
    await picker(page).setInputFiles(fixture("anatomia-slides.pdf"));
    await expect(page.getByText("Seu espaço de 250 MB acabou.")).toBeVisible();
    expect(await storedFiles(account)).toHaveLength(10);
    expect(await storedObjects(account)).toEqual([]);
  });

  test("na matéria: a aba envia para ela, a visão geral e o card mostram, a busca acha", async ({ page, account }) => {
    const subject = await seedSubject(account, { name: "Imunologia", color: "lilas" });
    await page.goto(`/materias/${subject.id}`);
    await expect(page.getByText("Nenhum arquivo nesta matéria ainda.")).toBeVisible();
    await page.getByRole("tab", { name: "Arquivos" }).click();
    await expect(page.getByRole("heading", { name: "Nenhum arquivo nesta matéria" })).toBeVisible();
    await expect(page.getByLabel("Enviar para")).toHaveCount(0);
    await picker(page).setInputFiles(fixture("imunologia-aula.pptx"));
    await ready(page, "imunologia-aula.pptx");
    expect((await storedFiles(account))[0].subject_id).toBe(subject.id);

    await page.getByRole("tab", { name: "Visão geral" }).click();
    await expect(page.getByRole("heading", { name: "Arquivos recentes" })).toBeVisible();
    await expect(page.getByRole("tabpanel").getByText("imunologia-aula.pptx")).toBeVisible();

    await page.goto("/materias");
    await expect(page.getByRole("link", { name: /Imunologia/ })).toContainText("1 arquivo");

    await page.goto("/inicio");
    await page.getByRole("searchbox").fill("imunologia aula");
    const results = page.getByRole("region", { name: "Resultados da busca" });
    await results.getByRole("link", { name: /imunologia-aula\.pptx/ }).click();
    await expect(page).toHaveURL(/\/arquivos#arquivo-/);
    await expect(page.getByRole("dialog", { name: "imunologia-aula.pptx" })).toBeVisible();
  });

  test("leitura interrompida em outro aparelho: Ler de novo baixa o arquivo e lê", async ({ page, account }) => {
    await gotoFiles(page);
    await picker(page).setInputFiles(fixture("anatomia-slides.pdf"));
    await ready(page, "anatomia-slides.pdf");
    // As if the app had been closed in the middle of reading.
    const [row] = await storedFiles(account);
    const documentId = row.documents[0].id;
    const { error } = await adminClient().from("document_chunks").delete().eq("document_id", documentId);
    if (error) throw error;
    const { error: stale } = await adminClient()
      .from("documents")
      .update({ status: "extraindo", content_hash: null, page_count: null })
      .eq("id", documentId);
    if (stale) throw stale;
    // 20 minutes later (the database stamps updated_at itself): nobody is reading it anymore.
    await page.clock.setSystemTime(new Date(Date.now() + 20 * 60_000));
    await page.reload();
    await expect(fileRow(page, "anatomia-slides.pdf").getByText("Leitura interrompida")).toBeVisible();
    const actions = await openActions(page, "anatomia-slides.pdf");
    await expect(actions.getByRole("button", { name: "Ver texto" })).toHaveCount(0);
    await actions.getByRole("button", { name: "Ler de novo" }).click();
    await ready(page, "anatomia-slides.pdf");
    const [again] = await storedFiles(account);
    expect(again.documents[0].document_chunks).toHaveLength(3);
  });

  test("sem internet, a lista abre e o envio espera a conexão", async ({ page, context, account }) => {
    void account;
    await gotoFiles(page);
    await picker(page).setInputFiles(fixture("anatomia-slides.pdf"));
    await ready(page, "anatomia-slides.pdf");
    await context.setOffline(true);
    await expect(page.getByText("Sem internet. Conecte-se para enviar arquivos.")).toBeVisible();
    await expect(picker(page)).toBeDisabled();
    await expect(fileRow(page, "anatomia-slides.pdf")).toBeVisible();
    await context.setOffline(false);
    await expect(picker(page)).toBeEnabled();
  });
});

async function readFixture(name: string): Promise<Buffer> {
  const { readFile } = await import("node:fs/promises");
  return readFile(fixture(name));
}

async function expectNoHorizontalScroll(page: Page) {
  const { overflow, report } = await page.evaluate(describeHorizontalOverflow);
  expect(overflow, `${overflow}px de rolagem horizontal${report}`).toBeLessThanOrEqual(0);
}
