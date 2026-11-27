import { describe, expect, it } from "vitest";
import { clampCamera, fitScale, initialCamera, toPage, zoomAround, zoomPercent } from "@/lib/ink/camera";
import {
  elementAt,
  elementInLasso,
  eraseArea,
  insidePolygon,
  moveStroke,
  strokeAt,
  strokeInLasso,
  textBoxHeight,
  touchesStroke,
} from "@/lib/ink/erase";
import { History } from "@/lib/ink/history";
import type { Stroke } from "@/lib/ink/strokes";
import { InputArbiter, PALM_GRACE_MS, TwoFingerTap } from "@/lib/ink/input";

const tablet = { width: 1074, height: 760, top: 84 };
const phone = { width: 412, height: 640, top: 84 };

describe("câmera da página", () => {
  it("em 100% a folha ocupa a largura, até 900 px, centrada abaixo da barra", () => {
    expect(fitScale(tablet)).toBeCloseTo(0.9);
    expect(fitScale(phone)).toBeCloseTo(0.388);
    const cam = initialCamera(tablet);
    expect(cam.x).toBeCloseTo((1074 - 900) / 2);
    expect(cam.y).toBe(84);
    expect(zoomPercent(cam, tablet)).toBe(100);
  });

  it("o zoom fica entre 50% e 400% e mantém parado o ponto da pinça", () => {
    const cam = initialCamera(tablet);
    const at = { x: 500, y: 400 };
    const before = toPage(cam, at.x, at.y);
    const zoomed = zoomAround(cam, 2, at, tablet);
    expect(zoomPercent(zoomed, tablet)).toBe(200);
    const after = toPage(zoomed, at.x, at.y);
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
    expect(zoomPercent(zoomAround(zoomed, 100, at, tablet), tablet)).toBe(400);
    expect(zoomPercent(zoomAround(cam, 0.01, at, tablet), tablet)).toBe(50);
  });

  it("a folha não some da tela ao rolar", () => {
    const cam = initialCamera(tablet);
    // Far down: the bottom of the page stops near the bottom of the screen.
    const down = clampCamera({ ...cam, y: -100_000 }, tablet);
    expect(down.y + 1414 * down.z).toBeCloseTo(760 - 24);
    // Far up: the top stays under the toolbar.
    expect(clampCamera({ ...cam, y: 5000 }, tablet).y).toBe(84);
    // Narrower than the screen: stays centered sideways.
    expect(clampCamera({ ...cam, x: 0 }, tablet).x).toBeCloseTo(cam.x);
  });
});

describe("caneta, palma e dedos", () => {
  const arbiter = (fingerDraws = false) => new InputArbiter(() => fingerDraws);

  it("a caneta desenha; a palma apoiada enquanto ela escreve é ignorada", () => {
    const a = arbiter();
    expect(a.down({ id: 1, kind: "pen", time: 0, primary: true }).role).toBe("draw");
    expect(a.down({ id: 2, kind: "touch", time: 10, primary: true }).role).toBe("ignore");
    a.up(1, "pen", 100);
    // The hand still rests a moment after the pen lifts.
    expect(a.down({ id: 3, kind: "touch", time: 100 + PALM_GRACE_MS - 1, primary: true }).role).toBe("ignore");
    expect(a.down({ id: 4, kind: "touch", time: 100 + PALM_GRACE_MS + 1, primary: true }).role).toBe("gesture");
  });

  it("a palma que tocou antes da caneta tem o traço de dedo descartado", () => {
    const a = arbiter(true);
    expect(a.down({ id: 2, kind: "touch", time: 0, primary: true }).role).toBe("draw");
    expect(a.down({ id: 1, kind: "pen", time: 50, primary: true })).toEqual({ role: "draw", cancelDrawing: 2 });
  });

  it("o botão lateral da S Pen não desenha: vira borracha enquanto apertado", () => {
    const a = arbiter();
    expect(a.down({ id: 1, kind: "pen", time: 0, primary: false }).role).toBe("erase");
    expect(a.roleOf(1)).toBe("erase");
    // The palm is still ignored while it erases.
    expect(a.down({ id: 2, kind: "touch", time: 10, primary: true }).role).toBe("ignore");
  });

  it("sem “Desenhar com o dedo”, um dedo rola e dois dão zoom", () => {
    const a = arbiter(false);
    expect(a.down({ id: 1, kind: "touch", time: 0, primary: true }).role).toBe("gesture");
    expect(a.down({ id: 2, kind: "touch", time: 5, primary: true }).role).toBe("gesture");
    expect(a.gestureCount()).toBe(2);
  });

  it("com “Desenhar com o dedo”, um dedo escreve; o segundo dedo vira gesto e desfaz o traço recém-começado", () => {
    const a = arbiter(true);
    expect(a.down({ id: 1, kind: "touch", time: 0, primary: true }).role).toBe("draw");
    expect(a.down({ id: 2, kind: "touch", time: 100, primary: true })).toEqual({ role: "gesture", cancelDrawing: 1 });
    expect(a.roleOf(1)).toBe("gesture");
    // A long stroke already made is kept.
    const b = arbiter(true);
    b.down({ id: 1, kind: "touch", time: 0, primary: true });
    expect(b.down({ id: 2, kind: "touch", time: 2000, primary: true })).toEqual({
      role: "gesture",
      cancelDrawing: undefined,
    });
  });

  it("o mouse desenha com o botão esquerdo", () => {
    const a = arbiter();
    expect(a.down({ id: 1, kind: "mouse", time: 0, primary: true }).role).toBe("draw");
  });
});

describe("toque de dois dedos", () => {
  it("dois dedos que tocam e saem rápido, sem mexer, desfazem", () => {
    const tap = new TwoFingerTap();
    tap.down(1, 100, 100, 0);
    tap.down(2, 200, 100, 20);
    expect(tap.up(1, 120)).toBe(false);
    expect(tap.up(2, 150)).toBe(true);
  });

  it("não conta se demorar, se mexer ou se forem três dedos", () => {
    const slow = new TwoFingerTap();
    slow.down(1, 0, 0, 0);
    slow.down(2, 50, 0, 10);
    slow.up(1, 400);
    expect(slow.up(2, 420)).toBe(false);

    const moved = new TwoFingerTap();
    moved.down(1, 0, 0, 0);
    moved.down(2, 50, 0, 10);
    moved.move(2, 90, 0);
    moved.up(1, 100);
    expect(moved.up(2, 110)).toBe(false);

    const three = new TwoFingerTap();
    three.down(1, 0, 0, 0);
    three.down(2, 50, 0, 5);
    three.down(3, 100, 0, 10);
    three.up(1, 100);
    three.up(2, 100);
    expect(three.up(3, 110)).toBe(false);
  });
});

describe("borracha e laço", () => {
  const line = (id: string, y: number): Stroke => ({
    id,
    tool: "caneta",
    color: "grafite",
    size: 4,
    points: [
      [100, y, 0.5],
      [500, y, 0.5],
    ],
  });
  let n = 0;
  const newId = () => `novo${n++}`;

  it("a borracha por traço pega o traço que ela toca, inclusive no meio de um trecho reto", () => {
    expect(touchesStroke(line("a", 100), 300, 105, 6)).toBe(true);
    expect(touchesStroke(line("a", 100), 300, 120, 6)).toBe(false);
    expect(touchesStroke(line("a", 100), 520, 100, 6)).toBe(false);
  });

  it("a borracha por área corta o traço em dois e deixa o resto", () => {
    const pieces = eraseArea(line("a", 100), 300, 100, 14, newId)!;
    expect(pieces).toHaveLength(2);
    expect(pieces[0].points[0]).toEqual([100, 100, 0.5]);
    expect(pieces[0].points.at(-1)![0]).toBeLessThan(300 - 14);
    expect(pieces[1].points[0][0]).toBeGreaterThan(300 + 14);
    expect(pieces[1].points.at(-1)).toEqual([500, 100, 0.5]);
    // New ids, same pen.
    expect(pieces.map((p) => p.id)).not.toContain("a");
    expect(pieces[0]).toMatchObject({ tool: "caneta", color: "grafite", size: 4 });
    // Away from the stroke: untouched.
    expect(eraseArea(line("a", 100), 300, 200, 14, newId)).toBeNull();
    // Over a short stroke: nothing left.
    expect(
      eraseArea(
        {
          ...line("b", 100),
          points: [
            [295, 100, 0.5],
            [305, 100, 0.5],
          ],
        },
        300,
        100,
        14,
        newId,
      ),
    ).toEqual([]);
  });

  it("o laço pega o traço com a maior parte dentro, e o elemento com o meio dentro", () => {
    const lasso: [number, number][] = [
      [50, 50],
      [600, 50],
      [600, 150],
      [50, 150],
    ];
    expect(insidePolygon(300, 100, lasso)).toBe(true);
    expect(insidePolygon(300, 200, lasso)).toBe(false);
    expect(strokeInLasso(line("a", 100), lasso)).toBe(true);
    expect(strokeInLasso(line("a", 300), lasso)).toBe(false);
    expect(elementInLasso({ id: "t", type: "texto", x: 100, y: 60, w: 300, text: "Fêmur", size: 24 }, lasso)).toBe(
      true,
    );
    expect(
      elementInLasso(
        { id: "i", type: "imagem", x: 100, y: 120, w: 300, h: 300, imageId: "a0000000-0000-4000-8000-000000000001" },
        lasso,
      ),
    ).toBe(false);
  });

  it("um toque acha o elemento de cima, ou o traço", () => {
    const image = {
      id: "i",
      type: "imagem" as const,
      x: 100,
      y: 100,
      w: 300,
      h: 200,
      imageId: "a0000000-0000-4000-8000-000000000001",
    };
    const text = { id: "t", type: "texto" as const, x: 150, y: 150, w: 200, text: "Fêmur", size: 24 };
    expect(elementAt([image, text], 200, 160)?.id).toBe("t");
    expect(elementAt([image, text], 120, 280)?.id).toBe("i");
    expect(elementAt([image, text], 600, 600)).toBeNull();
    expect(strokeAt([line("a", 100), line("b", 100)], 300, 102, 6)?.id).toBe("b");
    expect(strokeAt([line("a", 100)], 300, 130, 6)).toBeNull();
  });

  it("mover leva o traço junto, com 1 casa decimal", () => {
    expect(moveStroke(line("a", 100), 10.04, -5.06).points).toEqual([
      [110, 94.9, 0.5],
      [510, 94.9, 0.5],
    ]);
  });

  it("a caixa de texto cresce com as linhas", () => {
    const box = { id: "t", type: "texto" as const, x: 0, y: 0, w: 260, text: "curto", size: 20 };
    expect(textBoxHeight(box)).toBeCloseTo(27);
    expect(textBoxHeight({ ...box, text: "a\nb\nc" })).toBeCloseTo(81);
    // 25 characters fit in a line: 40 make two.
    expect(textBoxHeight({ ...box, text: "x".repeat(40) })).toBeCloseTo(54);
  });
});

describe("desfazer e refazer", () => {
  it("volta e avança entre os estados; uma mudança nova apaga o que dava para refazer", () => {
    const h = new History<string[]>();
    let page: string[] = [];
    h.push(page);
    page = ["a"];
    h.push(page);
    page = ["a", "b"];
    page = h.undo(page)!;
    expect(page).toEqual(["a"]);
    page = h.undo(page)!;
    expect(page).toEqual([]);
    expect(h.undo(page)).toBeNull();
    page = h.redo(page)!;
    expect(page).toEqual(["a"]);
    h.push(page);
    page = ["a", "c"];
    expect(h.canRedo).toBe(false);
  });

  it("guarda até o limite", () => {
    const h = new History<number>(3);
    for (let i = 0; i < 5; i++) h.push(i);
    let n = 5;
    const seen: number[] = [];
    for (let r = h.undo(n); r !== null; r = h.undo(n)) seen.push((n = r));
    expect(seen).toEqual([4, 3, 2]);
  });
});
