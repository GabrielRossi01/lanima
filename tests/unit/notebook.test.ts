import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLocalDb } from "@/lib/db/local";
import { finishStroke, quantizePoint, simplifyPoints, type InkPoint } from "@/lib/ink/strokes";
import { mergeNotebooks, mergePages } from "@/lib/notebook/merge";
import { isPageFull, jsonbTextBytes, PAGE_MAX_BYTES, pageText, type PageElement } from "@/lib/notebook/model";
import { LAST_USER_KEY } from "@/lib/query/device-cache";

// --- A server in memory, with the rules of the 12th migration ------------------------------

type Row = Record<string, unknown> & { id: string };
interface FakeServer {
  notebooks: Map<string, Row>;
  notebook_pages: Map<string, Row>;
  notebook_images: Map<string, Row>;
  storage: Set<string>;
  offline: boolean;
  /** Runs while a page is being saved, before the answer. */
  whileSaving?: () => Promise<void>;
}

function fakeSupabase(server: FakeServer) {
  const answer = (data: unknown, error: { code?: string; message: string } | null = null, status = 200) =>
    server.offline ? { data: null, error: { message: "Failed to fetch" }, status: 0 } : { data, error, status };

  function from(name: "notebooks" | "notebook_pages" | "notebook_images") {
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row | Record<string, unknown> = {};
    let range: [number, number] | null = null;
    const run = () => {
      if (server.offline) return answer(null);
      const table = server[name];
      const rows = [...table.values()].filter((r) => filters.every((f) => f(r)));
      if (op === "insert") {
        const row = payload as Row;
        if (table.has(row.id)) return answer(null, { code: "23505", message: "duplicate" }, 409);
        table.set(row.id, { ...row });
        return answer(null, null, 201);
      }
      if (op === "update") {
        for (const r of rows) Object.assign(r, payload);
        return answer(null, null, 204);
      }
      if (op === "delete") {
        for (const r of rows) {
          table.delete(r.id);
          if (name === "notebooks")
            for (const p of server.notebook_pages.values())
              if (p.notebook_id === r.id) server.notebook_pages.delete(p.id);
        }
        for (const i of server.notebook_images.values())
          if (!server.notebook_pages.has(i.page_id as string)) server.notebook_images.delete(i.id);
        return answer(null, null, 204);
      }
      const out = range ? rows.slice(range[0], range[1] + 1) : rows;
      return answer(out.map((r) => ({ ...r })));
    };
    const builder = {
      select: () => builder,
      order: () => builder,
      range: (a: number, b: number) => ((range = [a, b]), builder),
      in: (column: string, values: unknown[]) => (filters.push((r) => values.includes(r[column])), builder),
      eq: (column: string, value: unknown) => {
        if (column === "notebook_pages.notebook_id")
          filters.push((r) => server.notebook_pages.get(r.page_id as string)?.notebook_id === value);
        else filters.push((r) => r[column] === value);
        return builder;
      },
      insert: (row: Row) => ((op = "insert"), (payload = row), builder),
      update: (patch: Record<string, unknown>) => ((op = "update"), (payload = patch), builder),
      delete: () => ((op = "delete"), builder),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    };
    return builder;
  }

  function rpc(name: string, args: Record<string, unknown>) {
    if (server.offline) return Promise.resolve(answer(null));
    if (name === "save_notebook") {
      const existing = server.notebooks.get(args.p_id as string);
      if (existing && Date.parse(existing.edited_at as string) > Date.parse(args.p_edited_at as string))
        return Promise.resolve(answer([{ saved_edited_at: existing.edited_at, applied: false }]));
      server.notebooks.set(args.p_id as string, {
        id: args.p_id as string,
        subject_id: args.p_subject,
        title: args.p_title,
        edited_at: args.p_edited_at,
        created_at: existing?.created_at ?? args.p_edited_at,
      });
      return Promise.resolve(answer([{ saved_edited_at: args.p_edited_at, applied: true }]));
    }
    if (!server.notebooks.has(args.p_notebook as string))
      return Promise.resolve(answer(null, { code: "23503", message: "fk" }, 409));
    if (jsonbTextBytes(args.p_strokes) + jsonbTextBytes(args.p_elements) > PAGE_MAX_BYTES)
      return Promise.resolve(answer(null, { code: "23514", message: "check" }, 400));
    const existing = server.notebook_pages.get(args.p_id as string);
    if (existing && Date.parse(existing.edited_at as string) > Date.parse(args.p_edited_at as string))
      return Promise.resolve(
        answer([{ saved_version: existing.version, saved_edited_at: existing.edited_at, applied: false }]),
      );
    const version = existing ? (existing.version as number) + 1 : 1;
    server.notebook_pages.set(args.p_id as string, {
      id: args.p_id as string,
      notebook_id: args.p_notebook,
      position: args.p_position,
      background: args.p_background,
      strokes: args.p_strokes,
      elements: args.p_elements,
      version,
      edited_at: args.p_edited_at,
    });
    const during = server.whileSaving;
    server.whileSaving = undefined;
    return (during?.() ?? Promise.resolve()).then(() =>
      answer([{ saved_version: version, saved_edited_at: args.p_edited_at, applied: true }]),
    );
  }

  const storage = {
    from: () => ({
      upload: (path: string) => {
        if (server.offline) return Promise.resolve({ data: null, error: { message: "Failed to fetch" } });
        server.storage.add(path);
        return Promise.resolve({ data: { path }, error: null });
      },
      remove: (paths: string[]) => {
        for (const p of paths) server.storage.delete(p);
        return Promise.resolve({ data: [], error: null });
      },
    }),
  };
  return { from, rpc, storage };
}

let server: FakeServer;
vi.mock("@/lib/supabase/client", () => ({ getSupabase: () => fakeSupabase(server) }));

const sync = await import("@/lib/notebook/sync");

const ANA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const stroke = (id: string, x = 10) => ({
  id,
  tool: "caneta" as const,
  color: "grafite" as const,
  size: 3.6,
  points: [[x, 10, 0.5]] as InkPoint[],
});

// --- Strokes ------------------------------------------------------------------------------

describe("traços do caderno", () => {
  it("guarda x e y com 1 casa, a pressão com 2, dentro da folha", () => {
    expect(quantizePoint([12.345, 99.96, 0.4567])).toEqual([12.3, 100, 0.46]);
    expect(quantizePoint([-5, 2000, 1.7])).toEqual([0, 1414, 1]);
    expect(quantizePoint([1, 1, Number.NaN])).toEqual([1, 1, 0.5]);
  });

  it("uma reta vira dois pontos; uma curva e a mudança de pressão ficam", () => {
    const line: InkPoint[] = Array.from({ length: 50 }, (_, i) => [i * 2, i * 2, 0.5]);
    expect(simplifyPoints(line)).toEqual([line[0], line[49]]);
    const corner: InkPoint[] = [
      [0, 0, 0.5],
      [50, 0, 0.5],
      [100, 0, 0.5],
      [100, 50, 0.5],
      [100, 100, 0.5],
    ];
    expect(simplifyPoints(corner)).toEqual([corner[0], corner[2], corner[4]]);
    const pressing: InkPoint[] = [
      [0, 0, 0.1],
      [50, 0, 0.9],
      [100, 0, 0.1],
    ];
    expect(simplifyPoints(pressing)).toHaveLength(3);
  });

  it("um traço longo não estoura a pilha", () => {
    const long: InkPoint[] = Array.from({ length: 4000 }, (_, i) => [i / 4, Math.sin(i / 10) * 50 + 100, 0.5]);
    expect(simplifyPoints(long).length).toBeLessThan(long.length);
  });

  it("ao terminar, arredonda, tira repetidos e simplifica", () => {
    const done = finishStroke({
      id: "s1",
      tool: "caneta",
      color: "azul",
      size: 3.64,
      points: [
        [10.01, 10.02, 0.5],
        [10.04, 10.03, 0.5],
        [20, 20, 0.5],
        [30, 30, 0.5],
      ],
    });
    expect(done).toEqual({
      id: "s1",
      tool: "caneta",
      color: "azul",
      size: 3.6,
      points: [
        [10, 10, 0.5],
        [30, 30, 0.5],
      ],
    });
  });
});

// --- Page size and text ------------------------------------------------------------------

describe("tamanho e texto da página", () => {
  it("mede os bytes como o Postgres escreve o jsonb (conferido no banco local)", () => {
    expect(
      jsonbTextBytes([
        {
          id: "s1",
          tool: "caneta",
          color: "grafite",
          size: 3.6,
          points: [
            [1.5, 2, 0.25],
            [1000, 1414, 1],
            [0, 0.1, 0],
          ],
        },
      ]),
    ).toBe(123);
    expect(
      jsonbTextBytes([{ id: "t", type: "texto", x: 10, y: 20.5, w: 300, text: 'Fêmur e "tíbia"\nlinha', size: 16 }]),
    ).toBe(110);
  });

  it("avisa que a página está cheia aos 90% do limite", () => {
    const points = Array.from({ length: 4000 }, (_, i) => [i % 1000, 100.5, 0.55] as InkPoint);
    const strokes = Array.from({ length: 20 }, (_, i) => ({ ...stroke(`s${i}`), points }));
    expect(isPageFull({ strokes: strokes.slice(0, 5), elements: [] })).toBe(false);
    expect(isPageFull({ strokes, elements: [] })).toBe(true);
  });

  it("junta as caixas de texto de cima para baixo", () => {
    const elements: PageElement[] = [
      { id: "b", type: "texto", x: 10, y: 300, w: 200, text: "Tíbia", size: 16 },
      { id: "a", type: "texto", x: 10, y: 100, w: 200, text: "Fêmur", size: 16 },
      { id: "c", type: "texto", x: 10, y: 200, w: 200, text: "   ", size: 16 },
      { id: "i", type: "imagem", x: 0, y: 0, w: 100, h: 100, imageId: "a0000000-0000-4000-8000-000000000001" },
    ];
    expect(pageText(elements)).toBe("Fêmur\n\nTíbia");
  });
});

// --- Merge -------------------------------------------------------------------------------

const localPage = (over: Partial<Parameters<typeof mergePages>[0][number]>) => ({
  userId: ANA,
  id: "p1",
  notebookId: "n1",
  content: {},
  version: 1,
  editedAt: Date.parse("2026-11-27T10:00:00Z"),
  revision: 1,
  pending: false,
  deleted: false,
  ...over,
});
const serverPage = (over: Partial<Parameters<typeof mergePages>[1][number]> = {}) => ({
  id: "p1",
  notebook_id: "n1",
  version: 1,
  edited_at: "2026-11-27T10:00:00Z",
  ...over,
});

describe("encontro da cópia do aparelho com a do servidor", () => {
  it("lê do servidor as páginas novas e as que mudaram lá", () => {
    expect(mergePages([], [serverPage()]).fetch).toEqual(["p1"]);
    expect(mergePages([localPage({})], [serverPage()]).fetch).toEqual([]);
    expect(mergePages([localPage({})], [serverPage({ version: 2 })]).fetch).toEqual(["p1"]);
  });

  it("a mudança dela mais nova espera para subir; a mais velha perde", () => {
    const hers = localPage({ pending: true, editedAt: Date.parse("2026-11-27T10:05:00Z") });
    expect(mergePages([hers], [serverPage({ version: 2, edited_at: "2026-11-27T10:01:00Z" })])).toEqual({
      fetch: [],
      remove: [],
      overwritten: [],
    });
    expect(mergePages([hers], [serverPage({ version: 2, edited_at: "2026-11-27T10:09:00Z" })])).toEqual({
      fetch: ["p1"],
      remove: [],
      overwritten: ["p1"],
    });
  });

  it("apagada em outro aparelho sai daqui; uma nova, nunca enviada, fica", () => {
    expect(mergePages([localPage({})], []).remove).toEqual(["p1"]);
    expect(mergePages([localPage({ version: 0, pending: true })], []).remove).toEqual([]);
  });

  it("um caderno apagado aqui não volta do servidor", () => {
    const row = {
      userId: ANA,
      id: "n1",
      info: {},
      editedAt: 0,
      revision: 2,
      pending: true,
      deleted: true,
      onServer: true,
    };
    const server = [
      {
        id: "n1",
        subject_id: null,
        title: "Aula",
        edited_at: "2026-11-27T10:00:00Z",
        created_at: "2026-11-27T10:00:00Z",
      },
    ];
    expect(mergeNotebooks(ANA, [row], server).put).toEqual([]);
    expect(mergeNotebooks(ANA, [{ ...row, deleted: false, pending: false }], []).remove).toEqual(["n1"]);
  });
});

// --- Local-first and sync ----------------------------------------------------------------

describe("caderno offline e sincronização", () => {
  let clock = Date.parse("2026-11-27T10:00:00Z");
  beforeEach(async () => {
    localStorage.clear();
    await clearLocalDb();
    sync.clearNotebookMemory();
    localStorage.setItem(LAST_USER_KEY, JSON.stringify({ id: ANA, email: null }));
    server = {
      notebooks: new Map(),
      notebook_pages: new Map(),
      notebook_images: new Map(),
      storage: new Set(),
      offline: false,
    };
    clock = Date.parse("2026-11-27T10:00:00Z");
    vi.spyOn(Date, "now").mockImplementation(() => (clock += 1000));
  });
  afterEach(() => vi.restoreAllMocks());

  it("cria o caderno sem internet e sobe tudo quando a rede volta", async () => {
    server.offline = true;
    const { notebookId, pageId } = await sync.createNotebook(ANA, { subjectId: null, title: "Aula 07" });
    await sync.updatePage(ANA, pageId, { strokes: [stroke("s1")] });
    expect(await sync.syncNotebooks(ANA)).toMatchObject({ status: "offline" });
    expect(await sync.countPending(ANA)).toBe(2);

    server.offline = false;
    expect(await sync.syncNotebooks(ANA)).toMatchObject({ status: "ok", overwritten: 0 });
    expect(server.notebooks.get(notebookId)?.title).toBe("Aula 07");
    expect(server.notebook_pages.get(pageId)).toMatchObject({ version: 1, strokes: [stroke("s1")] });
    expect(await sync.countPending(ANA)).toBe(0);
    expect((await sync.getPage(ANA, pageId))?.version).toBe(1);
  });

  it("a gravação mais nova vence, venha de onde vier", async () => {
    const { pageId } = await sync.createNotebook(ANA, { subjectId: null, title: "Aula" });
    await sync.syncNotebooks(ANA);

    // Offline, she draws; later, another device draws on the same page: the other one is newer.
    await sync.updatePage(ANA, pageId, { strokes: [stroke("dela")] });
    const other = server.notebook_pages.get(pageId)!;
    Object.assign(other, {
      strokes: [stroke("outro", 50)],
      version: 2,
      edited_at: new Date((clock += 60_000)).toISOString(),
    });
    expect(await sync.syncNotebooks(ANA)).toMatchObject({ status: "ok", overwritten: 1 });
    expect((await sync.getPage(ANA, pageId))?.strokes).toEqual([stroke("outro", 50)]);
    expect(await sync.countPending(ANA)).toBe(0);

    // Now hers is the newest: it goes up over the other device's.
    Object.assign(other, { strokes: [stroke("velho")], version: 3, edited_at: new Date(clock - 30_000).toISOString() });
    await sync.updatePage(ANA, pageId, { strokes: [stroke("nova")] });
    expect(await sync.syncNotebooks(ANA)).toMatchObject({ status: "ok", overwritten: 0 });
    expect(server.notebook_pages.get(pageId)).toMatchObject({ version: 4, strokes: [stroke("nova")] });
  });

  it("o que ela desenha durante o envio não é dado como salvo", async () => {
    const { pageId } = await sync.createNotebook(ANA, { subjectId: null, title: "Aula" });
    await sync.syncNotebooks(ANA);
    await sync.updatePage(ANA, pageId, { strokes: [stroke("s1")] });
    server.whileSaving = () => sync.updatePage(ANA, pageId, { strokes: [stroke("s1"), stroke("s2")] });
    await sync.syncNotebooks(ANA);
    expect(server.notebook_pages.get(pageId)?.strokes).toEqual([stroke("s1")]);
    expect(await sync.getPage(ANA, pageId)).toMatchObject({
      pending: true,
      version: 2,
      strokes: [stroke("s1"), stroke("s2")],
    });
    await sync.syncNotebooks(ANA);
    expect(server.notebook_pages.get(pageId)).toMatchObject({ version: 3, strokes: [stroke("s1"), stroke("s2")] });
    expect(await sync.countPending(ANA)).toBe(0);
  });

  it("um caderno apagado em outro aparelho some daqui, com as páginas", async () => {
    const { notebookId, pageId } = await sync.createNotebook(ANA, { subjectId: null, title: "Aula" });
    await sync.syncNotebooks(ANA);
    server.notebooks.delete(notebookId);
    server.notebook_pages.delete(pageId);
    await sync.syncNotebooks(ANA);
    expect(await sync.listNotebooks(ANA)).toEqual([]);
    expect(await sync.getPage(ANA, pageId)).toBeNull();
  });

  it("vê no aparelho o caderno feito em outro", async () => {
    server.notebooks.set("b0000000-0000-4000-8000-000000000001", {
      id: "b0000000-0000-4000-8000-000000000001",
      subject_id: null,
      title: "Do iPad",
      edited_at: "2026-11-27T09:00:00Z",
      created_at: "2026-11-27T09:00:00Z",
    });
    server.notebook_pages.set("b1000000-0000-4000-8000-000000000001", {
      id: "b1000000-0000-4000-8000-000000000001",
      notebook_id: "b0000000-0000-4000-8000-000000000001",
      position: 0,
      background: "pautado",
      strokes: [stroke("s1")],
      elements: [],
      version: 3,
      edited_at: "2026-11-27T09:00:00Z",
    });
    await sync.syncNotebooks(ANA);
    expect((await sync.listNotebooks(ANA)).map((n) => n.title)).toEqual(["Do iPad"]);
    expect(await sync.listPages(ANA, "b0000000-0000-4000-8000-000000000001")).toMatchObject([
      { background: "pautado", version: 3, pending: false },
    ]);
  });

  it("uma página grande demais fica no aparelho e não é reenviada", async () => {
    const { pageId } = await sync.createNotebook(ANA, { subjectId: null, title: "Aula" });
    // 330 boxes of 5,000 characters: over 1.5 MB.
    await sync.updatePage(ANA, pageId, {
      elements: Array.from({ length: 330 }, (_, i) => ({
        id: `t${i}`,
        type: "texto" as const,
        x: 10,
        y: i,
        w: 300,
        text: "x".repeat(5000),
        size: 16,
      })),
    });
    expect(await sync.syncNotebooks(ANA)).toMatchObject({ refused: 1 });
    expect((await sync.getPage(ANA, pageId))?.refused).toBe(true);
    expect(await sync.syncNotebooks(ANA)).toMatchObject({ refused: 0 });
  });

  it("apagar o caderno apaga também as imagens guardadas", async () => {
    const { notebookId, pageId } = await sync.createNotebook(ANA, { subjectId: null, title: "Aula" });
    const imageId = await sync.addImage(ANA, pageId, new Blob(["x"], { type: "image/webp" }));
    await sync.syncNotebooks(ANA);
    expect(server.storage.has(`${ANA}/${imageId}`)).toBe(true);
    // (Not the size: the fake IndexedDB of jsdom doesn't keep a Blob as a Blob; browsers do. E2E.)
    expect(server.notebook_images.get(imageId)).toMatchObject({ page_id: pageId, mime_type: "image/webp" });

    await sync.deleteNotebook(ANA, notebookId);
    expect(await sync.listNotebooks(ANA)).toEqual([]);
    await sync.syncNotebooks(ANA);
    expect(server.notebooks.size + server.notebook_pages.size + server.notebook_images.size + server.storage.size).toBe(
      0,
    );
  });

  it("depois de sair, uma gravação atrasada não volta", async () => {
    const { pageId } = await sync.createNotebook(ANA, { subjectId: null, title: "Aula" });
    localStorage.removeItem(LAST_USER_KEY);
    await clearLocalDb();
    sync.clearNotebookMemory();
    await sync.updatePage(ANA, pageId, { strokes: [stroke("s1")] });
    await sync.createNotebook(ANA, { subjectId: null, title: "Depois" });
    expect(await sync.listNotebooks(ANA)).toEqual([]);
  });
});
