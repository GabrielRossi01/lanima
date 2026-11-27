import type { CDPSession, Page } from "@playwright/test";
import type { TestAccount } from "./helpers/accounts";
import { expect, test } from "./helpers/fixtures";
import { join } from "node:path";
import { lineStroke, seedNotebook, serverImages, serverPage } from "./helpers/notebook";

// Phase 7, part 3: writing on the page. The pen (with pressure) and the fingers are driven through
// Chromium's DevTools protocol, the same events a S Pen sends; the real S Pen and Apple Pencil are
// the phase's acceptance on the devices.

test.skip(({ browserName }) => browserName !== "chromium", "Caneta e toques simulados pelo protocolo do Chromium.");

type Point = [number, number];

/** Where a fraction of the page is on the screen (the page moves with scroll and zoom). */
async function onPaper(page: Page, fx: number, fy: number): Promise<Point> {
  const box = (await page.getByTestId("papel").boundingBox())!;
  return [box.x + box.width * fx, box.y + Math.min(box.height * fy, 400)];
}

/** A pen stroke from → to, its pressure going from `pressures[0]` to `pressures[1]`. */
async function penStroke(
  cdp: CDPSession,
  from: Point,
  to: Point,
  pressures: [number, number] = [0.2, 0.9],
  steps = 12,
) {
  const at = (i: number) => ({
    x: from[0] + ((to[0] - from[0]) * i) / steps,
    y: from[1] + ((to[1] - from[1]) * i) / steps,
    force: pressures[0] + ((pressures[1] - pressures[0]) * i) / steps,
  });
  const base = { pointerType: "pen" as const, button: "left" as const };
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...base, ...at(0), clickCount: 1, buttons: 1 });
  for (let i = 1; i <= steps; i++)
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...base, ...at(i), buttons: 1 });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    ...base,
    ...at(steps),
    clickCount: 1,
    buttons: 0,
  });
}

/** Fingers moving together: each finger goes from its start to its end. */
async function fingers(cdp: CDPSession, moves: { from: Point; to: Point }[], steps = 8) {
  const points = (i: number) =>
    moves.map((m, id) => ({
      id,
      x: m.from[0] + ((m.to[0] - m.from[0]) * i) / steps,
      y: m.from[1] + ((m.to[1] - m.from[1]) * i) / steps,
    }));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(0) });
  for (let i = 1; i <= steps; i++)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(i) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function openPage(
  page: Page,
  account: TestAccount,
  options: { fingerDraws?: boolean; strokes?: unknown[]; pages?: number } = {},
) {
  if (options.fingerDraws !== undefined) {
    await page.addInitScript((on) => {
      localStorage.setItem("lanima:caderno:ferramentas", JSON.stringify({ fingerDraws: on }));
    }, options.fingerDraws);
  }
  const { pageIds } = await seedNotebook(account, {
    title: "Aula 07",
    pages: Array.from({ length: options.pages ?? 1 }, (_, i) => ({ strokes: i === 0 ? (options.strokes ?? []) : [] })),
  });
  await page.goto(`/caderno/editar?pagina=${pageIds[0]}`);
  await expect(page.getByRole("heading", { level: 1, name: "Aula 07" })).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  return { pageId: pageIds[0], pageIds, cdp };
}

const strokes = (page: Page) => page.getByRole("img", { name: /^Página \d+: \d+ traços?$/ });

/** A point of the page (page units: 1000 wide) on the screen. */
async function pagePoint(page: Page, px: number, py: number): Promise<Point> {
  const box = (await page.getByTestId("papel").boundingBox())!;
  const scale = box.width / 1000;
  return [box.x + px * scale, box.y + py * scale];
}

/** The pen along a path (one point: a tap). `right`: with the side button pressed. */
async function penPath(cdp: CDPSession, points: Point[], button: "left" | "right" = "left", steps = 6) {
  const base = { pointerType: "pen" as const, button, force: 0.5 };
  const buttons = button === "left" ? 1 : 2;
  const [x0, y0] = points[0];
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...base, x: x0, y: y0, clickCount: 1, buttons });
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    for (let k = 1; k <= steps; k++) {
      const x = ax + ((bx - ax) * k) / steps;
      const y = ay + ((by - ay) * k) / steps;
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...base, x, y, buttons });
    }
  }
  const [xn, yn] = points[points.length - 1];
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    ...base,
    x: xn,
    y: yn,
    clickCount: 1,
    buttons: 0,
  });
}

/** Picks a tool: on its button, or on phones under "Mais ferramentas". */
async function chooseTool(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  if (!(await button.isVisible())) await page.getByRole("button", { name: "Mais ferramentas" }).click();
  await button.click();
}

/** Picks a color: its swatch on the toolbar, or on narrow screens through the "Cores" button. */
async function pickSwatch(page: Page, label: string) {
  const swatch = page.getByRole("button", { name: `Cor ${label}`, exact: true });
  if (!(await swatch.isVisible())) await page.getByRole("button", { name: /^Cores:/ }).click();
  await swatch.click();
}

test.describe("Caderno: escrever na página", () => {
  test("a caneta escreve com pressão; o traço fica salvo no formato da folha", async ({ page, account }) => {
    const { pageId, cdp } = await openPage(page, account);
    await expect(strokes(page)).toHaveAccessibleName("Página 1: 0 traços");
    await penStroke(cdp, await onPaper(page, 0.2, 0.3), await onPaper(page, 0.7, 0.35));
    await expect(strokes(page)).toHaveAccessibleName("Página 1: 1 traço");

    await expect.poll(async () => (await serverPage(pageId)).strokes.length, { timeout: 15_000 }).toBe(1);
    const [stroke] = (await serverPage(pageId)).strokes;
    expect(stroke).toMatchObject({ tool: "caneta", color: "grafite", size: 3.6 });
    // Page space (1000 wide), 1 decimal; the pressure followed the pen.
    for (const [x, y, p] of stroke.points) {
      expect(x).toBeGreaterThan(150);
      expect(x).toBeLessThan(750);
      expect(y).toBeGreaterThan(0);
      expect(Math.round(x * 10)).toBe(x * 10);
      expect(Math.round(y * 10)).toBe(y * 10);
      expect(p).toBeGreaterThan(0);
    }
    expect(new Set(stroke.points.map((p) => p[2])).size).toBeGreaterThan(1);
    await expect(page.getByRole("status")).toContainText("Salvo");
  });

  test("palma: um toque enquanto a caneta escreve não desenha nem rola a página", async ({ page, account }) => {
    const { cdp } = await openPage(page, account, { fingerDraws: true });
    const before = await page.getByTestId("papel").boundingBox();
    const start = await onPaper(page, 0.2, 0.3);
    const end = await onPaper(page, 0.6, 0.3);
    const pen = { pointerType: "pen" as const, button: "left" as const, force: 0.5 };
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      ...pen,
      x: start[0],
      y: start[1],
      clickCount: 1,
      buttons: 1,
    });
    // The hand lands and slides while the pen is down.
    await fingers(cdp, [{ from: await onPaper(page, 0.5, 0.6), to: await onPaper(page, 0.3, 0.2) }]);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...pen, x: end[0], y: end[1], buttons: 1 });
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      ...pen,
      x: end[0],
      y: end[1],
      clickCount: 1,
      buttons: 0,
    });
    await expect(strokes(page)).toHaveAccessibleName("Página 1: 1 traço");
    expect(await page.getByTestId("papel").boundingBox()).toEqual(before);
  });

  test("com a caneta, um dedo rola, dois dedos dão zoom e o toque de dois dedos desfaz", async ({ page, account }) => {
    const { cdp } = await openPage(page, account, { fingerDraws: false });
    await penStroke(cdp, await onPaper(page, 0.2, 0.3), await onPaper(page, 0.7, 0.3));
    await expect(strokes(page)).toHaveAccessibleName("Página 1: 1 traço");
    // Past the palm's moment after the pen.
    await page.waitForTimeout(700);

    // Zoomed in, the page is taller than any screen: then one finger scrolls it.
    const [x, y] = await onPaper(page, 0.5, 0.5);
    const zoom = page.getByRole("group", { name: "Zoom" });
    await expect(zoom).toContainText("100%");
    await fingers(cdp, [
      { from: [x - 40, y], to: [x - 120, y] },
      { from: [x + 40, y], to: [x + 120, y] },
    ]);
    await expect.poll(async () => Number((await zoom.textContent())?.replace(/\D/g, ""))).toBeGreaterThan(200);

    const before = (await page.getByTestId("papel").boundingBox())!;
    await fingers(cdp, [{ from: [x, y], to: [x, y - 200] }]);
    await expect.poll(async () => (await page.getByTestId("papel").boundingBox())!.y).toBeLessThan(before.y - 100);
    await expect(strokes(page)).toHaveAccessibleName("Página 1: 1 traço");

    await zoom.getByRole("button", { name: /ajustar à largura/ }).click();
    await expect(zoom).toContainText("100%");

    // Two fingers touch and lift: undo.
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { id: 0, x: x - 40, y },
        { id: 1, x: x + 40, y },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(strokes(page)).toHaveAccessibleName("Página 1: 0 traços");
    await page.getByRole("button", { name: "Refazer" }).click();
    await expect(strokes(page)).toHaveAccessibleName("Página 1: 1 traço");
  });

  test("“Desenhar com o dedo”: um dedo escreve; e pode ser desligado em Mais opções", async ({ page, account }) => {
    const { cdp } = await openPage(page, account, { fingerDraws: true });
    await fingers(cdp, [{ from: await onPaper(page, 0.2, 0.4), to: await onPaper(page, 0.6, 0.45) }]);
    await expect(strokes(page)).toHaveAccessibleName("Página 1: 1 traço");

    await page.getByRole("button", { name: "Mais opções" }).click();
    const options = page.getByRole("dialog", { name: "Mais opções" });
    await options.getByRole("switch", { name: "Desenhar com o dedo" }).click();
    await options.getByRole("button", { name: "Fechar" }).click();
    await fingers(cdp, [{ from: await onPaper(page, 0.2, 0.6), to: await onPaper(page, 0.6, 0.65) }]);
    await expect(strokes(page)).toHaveAccessibleName("Página 1: 1 traço");
  });

  test("marca-texto, cores e espessura; desfazer e refazer pelos botões, até no servidor", async ({
    page,
    account,
  }) => {
    const { pageId, cdp } = await openPage(page, account);
    const toolbar = page.getByRole("toolbar", { name: "Ferramentas de escrita" });
    await pickSwatch(page, "marca-texto rosa");
    await expect(toolbar.getByRole("button", { name: "Marca-texto", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await penStroke(cdp, await onPaper(page, 0.2, 0.3), await onPaper(page, 0.7, 0.3));

    await pickSwatch(page, "azul cimento");
    await expect(toolbar.getByRole("button", { name: "Caneta", exact: true })).toHaveAttribute("aria-pressed", "true");
    await toolbar.getByRole("button", { name: /Espessura do traço/ }).click();
    await page.getByRole("radio", { name: "Grossa" }).click();
    await expect(toolbar.getByRole("button", { name: "Espessura do traço: grossa" })).toBeVisible();
    await toolbar.getByRole("button", { name: "Lápis", exact: true }).click();
    await penStroke(cdp, await onPaper(page, 0.2, 0.4), await onPaper(page, 0.7, 0.4));
    await expect(strokes(page)).toHaveAccessibleName("Página 1: 2 traços");
    await expect
      .poll(async () => (await serverPage(pageId)).strokes.map((s) => [s.tool, s.color, s.size]), { timeout: 15_000 })
      .toEqual([
        ["marca_texto", "rosa", 22],
        // The pencil keeps its own color and thickness: grafite, média.
        ["lapis", "grafite", 3],
      ]);

    // On phones undo and redo are at the bottom, not on the toolbar.
    await page.getByRole("button", { name: "Desfazer" }).click();
    await expect(strokes(page)).toHaveAccessibleName("Página 1: 1 traço");
    await expect.poll(async () => (await serverPage(pageId)).strokes.length, { timeout: 15_000 }).toBe(1);
    await page.getByRole("button", { name: "Refazer" }).click();
    await expect.poll(async () => (await serverPage(pageId)).strokes.length, { timeout: 15_000 }).toBe(2);
  });

  test("páginas: trocar, mudar o fundo e excluir, sem recarregar a tela", async ({ page, account }) => {
    const { pageIds } = await openPage(page, account, { pages: 2 });
    await page.evaluate(() => Object.assign(window, { __lanimaMark: true }));
    await page.getByRole("button", { name: "Página 2", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Página 2 de 2");
    await expect(page).toHaveURL(new RegExp(`pagina=${pageIds[1]}`));

    await page.getByRole("button", { name: "Mais opções" }).click();
    await page.getByRole("dialog", { name: "Mais opções" }).getByRole("radio", { name: "Pautado" }).click();
    await expect.poll(async () => (await serverPage(pageIds[1])).background, { timeout: 15_000 }).toBe("pautado");

    await page
      .getByRole("dialog", { name: "Mais opções" })
      .getByRole("button", { name: "Excluir esta página" })
      .click();
    await page.getByRole("dialog", { name: "Excluir a página 2?" }).getByRole("button", { name: "Excluir" }).click();
    await expect(page.getByRole("status")).toContainText("Página 1 de 1");
    expect(await page.evaluate(() => "__lanimaMark" in window)).toBe(true);
  });

  test("2.000 traços: a página abre e o traço novo é desenhado sem redesenhar os outros", async ({ page, account }) => {
    const many = Array.from({ length: 2000 }, (_, i) => lineStroke(`s${i}`, 60 + (i % 40) * 33));
    const { cdp } = await openPage(page, account, { strokes: many });
    await expect(strokes(page)).toHaveAccessibleName("Página 1: 2000 traços", { timeout: 15_000 });
    // The first drawing of the whole page, then a moment for anything that follows it.
    await page.waitForFunction(() => performance.getEntriesByName("lanima:ink-render").length > 0);
    const opening = await page.evaluate(() => performance.getEntriesByName("lanima:ink-render").map((e) => e.duration));
    await page.waitForTimeout(500);
    await page.evaluate(() => performance.clearMeasures());
    await penStroke(cdp, await onPaper(page, 0.1, 0.2), await onPaper(page, 0.9, 0.25), [0.3, 0.8], 40);
    await expect(strokes(page)).toHaveAccessibleName("Página 1: 2001 traços");

    const live = await page.evaluate(() => performance.getEntriesByName("lanima:ink-live").map((e) => e.duration));
    const full = await page.evaluate(() => performance.getEntriesByName("lanima:ink-render").map((e) => e.duration));
    console.log(
      `2.000 traços · abrir: ${opening.map((d) => d.toFixed(1)).join(", ")} ms · traço ao vivo: máx ${Math.max(...live).toFixed(1)} ms · redesenhos durante o traço: ${full.length}`,
    );
    // Each frame of the pen only draws the stroke being made: well inside a 60 fps frame.
    expect(live.length).toBeGreaterThan(5);
    expect(Math.max(...live)).toBeLessThan(16);
    // The finished stroke went onto the ink layer alone: the 2,000 were not drawn again.
    expect(full).toEqual([]);
  });
});

test.describe("Caderno: escrever sem internet", () => {
  test("o traço feito offline continua depois de recarregar e sobe quando a rede volta", async ({
    page,
    context,
    account,
  }) => {
    const { pageId, cdp } = await openPage(page, account);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 });
    await page.waitForFunction(
      async () => Boolean(await caches.match("/caderno/editar", { ignoreSearch: true })),
      null,
      {
        timeout: 30_000,
      },
    );

    await context.setOffline(true);
    await penStroke(cdp, await onPaper(page, 0.2, 0.3), await onPaper(page, 0.7, 0.3));
    await expect(page.getByRole("status")).toContainText("Offline · será sincronizado");
    // Saved on the device: a reload (served by the service worker) still has it.
    await page.waitForTimeout(800);
    await page.reload();
    await expect(strokes(page)).toHaveAccessibleName("Página 1: 1 traço");
    expect((await serverPage(pageId)).strokes).toEqual([]);

    await context.setOffline(false);
    await expect.poll(async () => (await serverPage(pageId)).strokes.length, { timeout: 20_000 }).toBe(1);
    await expect(page.getByRole("status")).toContainText("Salvo");
  });
});

test.describe("Caderno: borracha, laço, texto e imagens", () => {
  test("borracha por traço e por área; o botão lateral da caneta apaga sem trocar de ferramenta", async ({
    page,
    account,
  }) => {
    const { pageId, cdp } = await openPage(page, account, {
      strokes: [lineStroke("a", 150), lineStroke("b", 300), lineStroke("c", 450)],
    });
    await expect(strokes(page)).toHaveAccessibleName("Página 1: 3 traços");

    // The side button pressed: the pen erases what it touches, and stays the pen.
    await penPath(cdp, [await pagePoint(page, 400, 120), await pagePoint(page, 400, 180)], "right");
    await expect(strokes(page)).toHaveAccessibleName("Página 1: 2 traços");
    await expect(page.getByRole("button", { name: "Caneta", exact: true })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Borracha", exact: true }).click();
    await penPath(cdp, [await pagePoint(page, 300, 270), await pagePoint(page, 300, 330)]);
    await expect(strokes(page)).toHaveAccessibleName("Página 1: 1 traço");

    // By area: only what it passes over goes; the stroke is cut in two.
    await page.getByRole("button", { name: /^Borracha: / }).click();
    await page.getByRole("radio", { name: "Por área" }).click();
    await penPath(cdp, [await pagePoint(page, 430, 420), await pagePoint(page, 430, 480)]);
    await expect(strokes(page)).toHaveAccessibleName("Página 1: 2 traços");
    await expect
      .poll(async () => (await serverPage(pageId)).strokes.map((s) => s.id).includes("c"), { timeout: 15_000 })
      .toBe(false);
    expect((await serverPage(pageId)).strokes).toHaveLength(2);

    // One undo puts back the whole pass of the eraser.
    await page.getByRole("button", { name: "Desfazer" }).click();
    await expect(strokes(page)).toHaveAccessibleName("Página 1: 1 traço");
  });

  test("laço: seleciona, move e apaga; desfazer traz de volta", async ({ page, account }) => {
    const { pageId, cdp } = await openPage(page, account, { strokes: [lineStroke("a", 150), lineStroke("b", 400)] });
    await chooseTool(page, "Laço: selecionar, mover e apagar");
    const loop: Point[] = [
      [60, 100],
      [820, 100],
      [820, 200],
      [60, 200],
      [60, 110],
    ];
    await penPath(cdp, await Promise.all(loop.map(([x, y]) => pagePoint(page, x, y))));
    await expect(page.getByRole("group", { name: "Seleção: 1 item" })).toBeVisible();

    // Dragged from inside the selection: 100 down.
    await penPath(cdp, [await pagePoint(page, 400, 150), await pagePoint(page, 400, 250)]);
    await expect
      .poll(async () => (await serverPage(pageId)).strokes.find((s) => s.id === "a")?.points[0][1] ?? 0, {
        timeout: 15_000,
      })
      .toBeGreaterThan(240);
    const moved = (await serverPage(pageId)).strokes.find((s) => s.id === "a")!;
    expect(moved.points[0][1]).toBeLessThan(260);
    expect((await serverPage(pageId)).strokes.find((s) => s.id === "b")!.points[0][1]).toBe(400);

    await page.getByRole("button", { name: "Apagar seleção" }).click();
    await expect(strokes(page)).toHaveAccessibleName("Página 1: 1 traço");
    await expect
      .poll(async () => (await serverPage(pageId)).strokes.map((s) => s.id), { timeout: 15_000 })
      .toEqual(["b"]);
    await page.getByRole("button", { name: "Desfazer" }).click();
    await expect(strokes(page)).toHaveAccessibleName("Página 1: 2 traços");
  });

  test("caixa de texto: um toque cria; o texto fica salvo; uma caixa vazia some", async ({ page, account }) => {
    const { pageId, cdp } = await openPage(page, account);
    await chooseTool(page, "Caixa de texto");
    await penPath(cdp, [await pagePoint(page, 100, 200)]);
    const boxes = page.getByRole("textbox", { name: "Caixa de texto" });
    await expect(boxes.first()).toBeFocused();
    await page.keyboard.type("Fêmur: o osso mais longo");
    await page.getByRole("button", { name: "Caneta", exact: true }).click();
    await expect
      .poll(async () => (await serverPage(pageId)).elements.map((e) => [e.type, e.text]), { timeout: 15_000 })
      .toEqual([["texto", "Fêmur: o osso mais longo"]]);

    await chooseTool(page, "Caixa de texto");
    // In the middle of the page (its lower left corner is under the zoom control on a tablet).
    await penPath(cdp, [await pagePoint(page, 500, 420)]);
    await expect(boxes).toHaveCount(2);
    await page.getByRole("button", { name: "Caneta", exact: true }).click();
    await expect(boxes).toHaveCount(1);

    // The pen writes over the text when the text tool is off.
    await penStroke(cdp, await pagePoint(page, 80, 205), await pagePoint(page, 500, 215));
    await expect(strokes(page)).toHaveAccessibleName("Página 1: 1 traço");

    await page.waitForTimeout(800);
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Caixa de texto" })).toHaveValue("Fêmur: o osso mais longo");
  });

  test("imagem: entra comprimida, sobe ao servidor e libera o espaço quando apagada", async ({ page, account }) => {
    const { pageId, cdp } = await openPage(page, account);
    const chooser = page.waitForEvent("filechooser");
    await chooseTool(page, "Inserir imagem ou foto");
    await (await chooser).setFiles(join(__dirname, "..", "fixtures", "files", "livro-pagina.png"));
    const image = page.getByRole("img", { name: "Imagem colada" });
    await expect(image).toBeVisible();
    await expect
      .poll(async () => (await serverImages(pageId)).map((i) => [i.mime_type, i.stored, Boolean(i.uploaded_at)]), {
        timeout: 20_000,
      })
      .toEqual([["image/webp", true, true]]);
    const [stored] = await serverImages(pageId);
    expect(stored.size_bytes).toBeLessThan(600_000);
    expect((await serverPage(pageId)).elements).toMatchObject([{ type: "imagem", imageId: stored.id }]);

    // Lasso around it, delete; leaving the page frees its place in the 250 MB.
    await chooseTool(page, "Laço: selecionar, mover e apagar");
    const box = (await image.boundingBox())!;
    const pad = 12;
    await penPath(cdp, [
      [box.x - pad, box.y - pad],
      [box.x + box.width + pad, box.y - pad],
      [box.x + box.width + pad, box.y + box.height + pad],
      [box.x - pad, box.y + box.height + pad],
      [box.x - pad, box.y],
    ]);
    await page.getByRole("button", { name: "Apagar seleção" }).click();
    await expect(image).toHaveCount(0);
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "Caderno" }).click();
    await expect.poll(async () => (await serverImages(pageId)).length, { timeout: 20_000 }).toBe(0);
  });
});
