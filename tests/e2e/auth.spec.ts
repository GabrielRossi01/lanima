import { test as base } from "@playwright/test";
import sharp from "sharp";
import { adminClient, createAccount, signIn, uniqueEmail } from "./helpers/accounts";
import { expect, test } from "./helpers/fixtures";
import { codeFrom, latestEmailTo, magicLinkFrom } from "./helpers/mailpit";
import { describeHorizontalOverflow } from "./helpers/overflow";

/** A camera-like photo (landscape, not square) for the crop step. */
async function photo() {
  const buffer = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#7E97A7" } })
    .jpeg()
    .toBuffer();
  return { name: "foto.jpg", mimeType: "image/jpeg", buffer };
}

async function requestEmail(page: import("@playwright/test").Page, email: string, button = "Receber link e código") {
  await page.getByLabel("E-mail").fill(email);
  const sentAfter = Date.now() - 1000;
  await page.getByRole("button", { name: button }).click();
  await expect(page.getByRole("heading", { name: "Confira seu e-mail" })).toBeVisible();
  return latestEmailTo(email, sentAfter);
}

base.describe("Entrar", () => {
  base("sem sessão, o app manda para /entrar e volta para a tela pedida", async ({ page }) => {
    await page.goto("/perfil");
    await expect(page).toHaveURL(/\/entrar\?proxima=%2Fperfil$/);
    await expect(page.getByRole("heading", { level: 1, name: "Entrar no Lanima" })).toBeVisible();

    const account = await createAccount({ prefix: "next" });
    const message = await requestEmail(page, account.email);
    await page.getByLabel("Código do e-mail").fill(codeFrom(message));
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/perfil$/);
    await expect(page.getByRole("heading", { level: 1, name: "Perfil e configurações" })).toBeVisible();
  });

  base("o e-mail traz o link e o código; o link entra no app", async ({ page, baseURL }) => {
    const account = await createAccount({ prefix: "link" });
    await page.goto("/entrar");
    const message = await requestEmail(page, account.email);
    expect(message.Subject).toBe("Seu acesso ao Lanima");
    expect(codeFrom(message)).toMatch(/^\d{6,10}$/);

    // The link points at the configured site URL; open the same path on the test server.
    const link = magicLinkFrom(message);
    expect(link.pathname).toBe("/callback");
    expect(link.searchParams.get("type")).toBe("email");
    await page.goto(new URL(link.pathname + link.search, baseURL).toString());
    await expect(page).toHaveURL(/\/inicio$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(", Maria");
  });

  base("código errado mostra o erro e não entra", async ({ page }) => {
    const email = uniqueEmail("wrong");
    await page.goto("/entrar");
    await requestEmail(page, email);
    await page.getByLabel("Código do e-mail").fill("000000");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByText("Código inválido ou expirado")).toBeVisible();
    await expect(page).toHaveURL(/\/entrar/);
  });

  base("link vencido ou já usado volta para /entrar com aviso", async ({ page }) => {
    await page.goto("/callback?token_hash=invalido&type=email");
    await expect(page).toHaveURL(/\/entrar\?erro=link$/);
    await expect(page.getByText("Esse link expirou ou já foi usado")).toBeVisible();
  });

  base("/entrar cabe na tela, sem rolagem horizontal", async ({ page }) => {
    await page.goto("/entrar");
    const { overflow, report } = await page.evaluate(describeHorizontalOverflow);
    expect(overflow, `/entrar: ${overflow}px de rolagem horizontal${report}`).toBeLessThanOrEqual(0);
  });
});

base.describe("Onboarding", () => {
  base("conta nova: código do e-mail, perfil com foto e matérias, meta e Início", async ({ page }) => {
    const email = uniqueEmail("onboarding");
    await page.goto("/inicio");
    await expect(page).toHaveURL(/\/entrar$/);
    await page.getByRole("link", { name: "Criar conta", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Criar conta no Lanima" })).toBeVisible();
    const message = await requestEmail(page, email, "Criar conta com e-mail");
    await page.getByLabel("Código do e-mail").fill(codeFrom(message));
    await page.getByRole("button", { name: "Criar conta", exact: true }).click();

    // Step 1: welcome.
    await expect(page).toHaveURL(/\/boas-vindas$/);
    await expect(page.getByText("Passo 1 de 3")).toBeVisible();
    await expect(page.getByText("Seus estudos de Biomedicina, num lugar só.")).toBeVisible();
    await page.getByRole("button", { name: "Começar" }).click();

    // Step 2: profile.
    await expect(page.getByRole("heading", { name: "Monte seu perfil" })).toBeVisible();
    let overflow = await page.evaluate(describeHorizontalOverflow);
    expect(overflow.overflow, `passo 2: ${overflow.overflow}px${overflow.report}`).toBeLessThanOrEqual(0);

    // Validation first.
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText("Escreva seu nome ou apelido.")).toBeVisible();
    await expect(page.getByText("Escolha o semestre.")).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles(await photo());
    const crop = page.getByRole("dialog", { name: "Ajustar foto" });
    await expect(crop).toBeVisible();
    await crop.getByRole("button", { name: "Usar foto" }).click();
    await expect(page.getByText("Foto atualizada")).toBeVisible();
    await expect(crop).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Trocar foto" })).toBeVisible();

    // A full name with an "s": a broken regex once cut "Gabriel Rossi" to "Gabriel Ro".
    await page.getByLabel("Como prefere que te chamem?").fill("Ana Souza");
    await page.getByLabel("Semestre").selectOption("4");
    await expect(page.getByLabel("Curso")).toHaveValue("Biomedicina");
    await page.getByLabel("Instituição").fill("Universidade Federal Exemplo");
    await page.getByRole("button", { name: "Bioquímica" }).click();
    await page.getByRole("button", { name: "Imunologia" }).click();
    await expect(page.getByRole("button", { name: "Bioquímica" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Outra" }).click();
    await page.getByLabel("Nome da matéria").fill("Farmacologia");
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await expect(page.getByRole("button", { name: "Farmacologia" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Continuar" }).click();

    // Step 3: daily goal.
    await expect(page.getByText("Passo 3 de 3")).toBeVisible();
    overflow = await page.evaluate(describeHorizontalOverflow);
    expect(overflow.overflow, `passo 3: ${overflow.overflow}px${overflow.report}`).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "3h", exact: true }).click();
    await expect(page.getByLabel(/Meta diária de foco/)).toHaveValue("180");
    await page.getByRole("button", { name: "Concluir" }).click();

    // iOS shows the install steps at the end; Android without a prompt goes straight on.
    const install = page.getByRole("dialog", { name: "Instalar o Lanima" });
    await expect(install.or(page.getByRole("heading", { level: 1, name: /, Ana$/ }))).toBeVisible();
    if (await install.isVisible()) await install.getByRole("button", { name: "Entendi" }).click();
    await expect(page).toHaveURL(/\/inicio$/);
    // Only the first name in the greeting.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^(Bom dia|Boa tarde|Boa noite), Ana$/);
    await expect(page.getByText("Foco hoje · meta 3h")).toBeVisible();

    // Everything landed in the database.
    const admin = adminClient();
    const userId = await page.evaluate(
      () => (JSON.parse(localStorage.getItem("lanima:last-user")!) as { id: string }).id,
    );
    const { data: profile } = await admin.from("profiles").select("*").eq("id", userId).single();
    expect(profile).toMatchObject({
      name: "Ana Souza",
      semester: 4,
      course: "Biomedicina",
      institution: "Universidade Federal Exemplo",
      daily_focus_goal_min: 180,
    });
    expect(profile!.onboarding_completed_at).not.toBeNull();
    expect(profile!.avatar_path).toMatch(new RegExp(`^${userId}/avatar-\\d+\\.(webp|jpg)$`));
    const { data: file } = await admin.storage.from("avatars").download(profile!.avatar_path!);
    expect(file!.size).toBeLessThan(200_000);
    const { data: subjects } = await admin.from("subjects").select("name, color").eq("user_id", userId).order("name");
    expect(subjects).toEqual([
      { name: "Bioquímica", color: "rosa" },
      { name: "Farmacologia", color: "amarelo" },
      { name: "Imunologia", color: "verde" },
    ]);

    // Finished: the onboarding no longer shows.
    await page.goto("/boas-vindas");
    await expect(page).toHaveURL(/\/inicio$/);
  });
});

test.describe("Perfil", () => {
  test("edita, salva e mantém depois de recarregar", async ({ page, account }) => {
    await page.goto("/perfil");
    await expect(page.getByLabel("Nome")).toHaveValue(account.name);
    await expect(page.getByRole("button", { name: "Salvar alterações" })).toBeDisabled();
    await page.getByLabel("Nome").fill("Maria Clara");
    await page.getByLabel("Instituição").fill("");
    await page.getByLabel("Semestre").selectOption("5");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText("Perfil salvo")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Nome")).toHaveValue("Maria Clara");
    await expect(page.getByLabel("Semestre")).toHaveValue("5");
    await expect(page.getByRole("main").getByText("Biomedicina · 5º semestre")).toBeVisible();
  });

  test("“Aparecer no ranking” é salvo no perfil", async ({ page, account }) => {
    await page.goto("/perfil");
    const toggle = page.getByRole("switch", { name: "Aparecer no ranking" });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect
      .poll(async () => {
        const { data } = await adminClient().from("profiles").select("show_in_ranking").eq("id", account.id).single();
        return data?.show_in_ranking;
      })
      .toBe(false);
  });

  test("o tema escolhido vale em outro aparelho", async ({ page, account, browser }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/perfil");
    await page.getByRole("radio", { name: "Escuro" }).click();
    await expect
      .poll(async () => {
        const { data } = await adminClient().from("profiles").select("theme").eq("id", account.id).single();
        return data?.theme;
      })
      .toBe("dark");

    const other = await browser.newContext({ colorScheme: "light" });
    const otherPage = await other.newPage();
    await signIn(otherPage, account);
    await expect(otherPage.locator("html")).toHaveAttribute("data-theme", "dark");
    await other.close();
  });

  test("Sair encerra a sessão", async ({ page, account }) => {
    void account;
    await page.goto("/perfil");
    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/entrar/);
    await expect(page.getByRole("heading", { level: 1, name: "Entrar no Lanima" })).toBeVisible();
    await page.goto("/inicio");
    await expect(page).toHaveURL(/\/entrar$/);
  });
});
