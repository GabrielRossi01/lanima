import { describe, expect, it } from "vitest";
import { clampCamera, fitScale, initialCamera, toPage, zoomAround, zoomPercent } from "@/lib/ink/camera";
import { History } from "@/lib/ink/history";
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

  it("o botão lateral da S Pen não desenha", () => {
    expect(arbiter().down({ id: 1, kind: "pen", time: 0, primary: false }).role).toBe("ignore");
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
