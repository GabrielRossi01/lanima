import type { Table } from "dexie";
import { z } from "zod";
import { isSignedIn, localDb, type NotebookImageRow, type NotebookPageRow, type NotebookRow } from "@/lib/db/local";
import { getSupabase } from "@/lib/supabase/client";
import { mergeNotebooks, mergePages, type ServerNotebook, type ServerPageMeta } from "./merge";
import {
  notebookInfoSchema,
  pageContentSchema,
  pageText,
  type NotebookInfo,
  type PageBackground,
  type PageContent,
} from "./model";

/**
 * The notebook, local-first (section 6). Every change is written on the device first (Dexie, or
 * memory where IndexedDB can't be used) and sent by `syncNotebooks`, when there is network:
 * notebooks, then pages, then pictures, then deletions. Then the server's copy is read back and
 * merged (lib/notebook/merge.ts): per page, the newest change wins, wherever it was made.
 */

export const IMAGES_BUCKET = "notebook";

// --- Storage on the device ---------------------------------------------------------------

interface Tables {
  notebooks: NotebookRow;
  notebookPages: NotebookPageRow;
  notebookImages: NotebookImageRow;
}
type TableName = keyof Tables;

/** Where IndexedDB can't be used (or a write failed), rows wait here for this visit. */
const memory: { [K in TableName]: Map<string, Tables[K]> } = {
  notebooks: new Map(),
  notebookPages: new Map(),
  notebookImages: new Map(),
};
const memoryKey = (userId: string, id: string) => `${userId}:${id}`;

function table<K extends TableName>(name: K): Table<Tables[K], [string, string]> | null {
  const db = localDb();
  return db ? (db[name] as unknown as Table<Tables[K], [string, string]>) : null;
}

async function rowsOf<K extends TableName>(name: K, userId: string): Promise<Tables[K][]> {
  let stored: Tables[K][] = [];
  try {
    stored = (await table(name)?.where({ userId }).toArray()) ?? [];
  } catch {
    // Can't be opened: only what is in memory.
  }
  const inMemory = [...memory[name].values()].filter((r) => r.userId === userId);
  const ids = new Set(inMemory.map((r) => r.id));
  return [...stored.filter((r) => !ids.has(r.id)), ...inMemory];
}

async function rowOf<K extends TableName>(name: K, userId: string, id: string): Promise<Tables[K] | undefined> {
  const inMemory = memory[name].get(memoryKey(userId, id));
  if (inMemory) return inMemory;
  try {
    return await table(name)?.get([userId, id]);
  } catch {
    return undefined;
  }
}

async function putRows<K extends TableName>(name: K, rows: readonly Tables[K][]): Promise<void> {
  const mine = rows.filter((r) => isSignedIn(r.userId));
  if (mine.length === 0) return;
  try {
    const target = table(name);
    if (!target) throw new Error("no IndexedDB");
    await target.bulkPut([...mine]);
    for (const r of mine) memory[name].delete(memoryKey(r.userId, r.id));
  } catch {
    for (const r of mine) memory[name].set(memoryKey(r.userId, r.id), r);
  }
}

async function removeRows(name: TableName, userId: string, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  for (const id of ids) memory[name].delete(memoryKey(userId, id));
  try {
    await table(name)?.bulkDelete(ids.map((id) => [userId, id] as [string, string]));
  } catch {
    // Nothing was stored there either.
  }
}

/** Changes to the device's copy of one person's notebook happen one at a time. */
const locks = new Map<string, Promise<unknown>>();
function serial<T>(userId: string, work: () => Promise<T>): Promise<T> {
  const previous = locks.get(userId) ?? Promise.resolve();
  const next = previous.then(work, work);
  locks.set(
    userId,
    next.catch(() => {}),
  );
  return next;
}

/** "local": she changed something here (to be sent); "server": read from the server. */
export type ChangeSource = "local" | "server";
type Listener = (userId: string, source: ChangeSource) => void;
const listeners = new Set<Listener>();
/** Called after any change to the device's copy. */
export function onNotebookChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function changed(userId: string, source: ChangeSource = "local") {
  for (const listener of listeners) listener(userId, source);
}

/** Forgets what waits in memory (sign-out). The IndexedDB copy is erased by clearLocalDb. */
export function clearNotebookMemory() {
  for (const map of Object.values(memory)) map.clear();
  checked.clear();
}

// --- Reading -----------------------------------------------------------------------------

export interface LocalNotebook extends NotebookInfo {
  id: string;
  editedAt: number;
  /** Not on the server yet. */
  pending: boolean;
}

export interface LocalPage extends PageContent {
  id: string;
  notebookId: string;
  version: number;
  editedAt: number;
  pending: boolean;
  /** The server refused it (over the size limit): kept here only. */
  refused: boolean;
}

function toNotebook(row: NotebookRow): LocalNotebook | null {
  const info = notebookInfoSchema.safeParse(row.info);
  if (!info.success || row.deleted) return null;
  return { ...info.data, id: row.id, editedAt: row.editedAt, pending: row.pending };
}

/** The last pages checked, by their state: the open page is read again after each of its saves. */
const checked = new Map<string, PageContent>();
const checkedKey = (row: NotebookPageRow) => `${row.userId}:${row.id}:${row.revision}:${row.version}:${row.editedAt}`;

function toPage(row: NotebookPageRow): LocalPage | null {
  if (row.deleted) return null;
  const key = checkedKey(row);
  let content = checked.get(key);
  if (!content) {
    const parsed = pageContentSchema.safeParse(row.content);
    if (!parsed.success) return null;
    content = parsed.data;
    checked.set(key, content);
    if (checked.size > 8) checked.delete(checked.keys().next().value!);
  }
  return {
    ...content,
    id: row.id,
    notebookId: row.notebookId,
    version: row.version,
    editedAt: row.editedAt,
    pending: row.pending,
    refused: row.refused ?? false,
  };
}

const byPosition = (a: LocalPage, b: LocalPage) => a.position - b.position || a.id.localeCompare(b.id);

/** Her notebooks, the last changed first. */
export async function listNotebooks(userId: string): Promise<LocalNotebook[]> {
  const rows = await rowsOf("notebooks", userId);
  return rows
    .map(toNotebook)
    .filter((n): n is LocalNotebook => n !== null)
    .sort((a, b) => b.editedAt - a.editedAt);
}

/** The pages of a notebook in order, or all her pages. */
export async function listPages(userId: string, notebookId?: string): Promise<LocalPage[]> {
  const notebooks = new Set((await listNotebooks(userId)).map((n) => n.id));
  const rows = await rowsOf("notebookPages", userId);
  return rows
    .filter((r) => (notebookId === undefined || r.notebookId === notebookId) && notebooks.has(r.notebookId))
    .map(toPage)
    .filter((p): p is LocalPage => p !== null)
    .sort(byPosition);
}

/** A page without its strokes: what lists need (counts, order, last change, text for search). */
export type PageSummary = Omit<LocalPage, "strokes" | "elements"> & { strokeCount: number; text: string };

/** What a list needs of a page: its strokes are only counted, not checked one by one. */
const pageSummarySchema = pageContentSchema.extend({ strokes: z.array(z.unknown()) });

/** Every page of hers, without the strokes (lists and search don't keep them in memory). */
export async function listPageSummaries(userId: string): Promise<PageSummary[]> {
  const notebooks = new Set((await listNotebooks(userId)).map((n) => n.id));
  const rows = await rowsOf("notebookPages", userId);
  return rows
    .filter((r) => !r.deleted && notebooks.has(r.notebookId))
    .flatMap((row) => {
      const content = pageSummarySchema.safeParse(row.content);
      if (!content.success) return [];
      const { strokes, elements, ...rest } = content.data;
      return [
        {
          ...rest,
          id: row.id,
          notebookId: row.notebookId,
          version: row.version,
          editedAt: row.editedAt,
          pending: row.pending,
          refused: row.refused ?? false,
          strokeCount: strokes.length,
          text: pageText(elements),
        },
      ];
    })
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

export async function getPage(userId: string, pageId: string): Promise<LocalPage | null> {
  const row = await rowOf("notebookPages", userId, pageId);
  if (!row) return null;
  const notebook = await rowOf("notebooks", userId, row.notebookId);
  return notebook && !notebook.deleted ? toPage(row) : null;
}

export async function getImageBlob(userId: string, imageId: string): Promise<Blob | null> {
  return (await rowOf("notebookImages", userId, imageId))?.blob ?? null;
}

/** Changes made here and not on the server yet. */
export async function countPending(userId: string): Promise<number> {
  const [notebooks, pages, images] = await Promise.all([
    rowsOf("notebooks", userId),
    rowsOf("notebookPages", userId),
    rowsOf("notebookImages", userId),
  ]);
  return (
    notebooks.filter((r) => r.pending && !r.refused).length +
    pages.filter((r) => r.pending && !r.refused).length +
    images.filter((r) => !r.sent).length
  );
}

// --- Her changes -------------------------------------------------------------------------

const emptyPage = (position: number, background: PageBackground): PageContent => ({
  position,
  background,
  strokes: [],
  elements: [],
});

function newPageRow(userId: string, notebookId: string, content: PageContent, now: number): NotebookPageRow {
  return {
    userId,
    id: crypto.randomUUID(),
    notebookId,
    content,
    version: 0,
    editedAt: now,
    revision: 1,
    pending: true,
    deleted: false,
  };
}

/** A new notebook, with its first page. */
export function createNotebook(
  userId: string,
  input: { subjectId: string | null; title: string; background?: PageBackground },
): Promise<{ notebookId: string; pageId: string }> {
  return serial(userId, async () => {
    const now = Date.now();
    const info: NotebookInfo = notebookInfoSchema.parse({
      subjectId: input.subjectId,
      title: input.title,
      createdAt: now,
    });
    const notebook: NotebookRow = {
      userId,
      id: crypto.randomUUID(),
      info,
      editedAt: now,
      revision: 1,
      pending: true,
      deleted: false,
      onServer: false,
    };
    const page = newPageRow(userId, notebook.id, emptyPage(0, input.background ?? "pontilhado"), now);
    await putRows("notebooks", [notebook]);
    await putRows("notebookPages", [page]);
    changed(userId);
    return { notebookId: notebook.id, pageId: page.id };
  });
}

export function updateNotebook(
  userId: string,
  notebookId: string,
  patch: { subjectId?: string | null; title?: string },
): Promise<void> {
  return serial(userId, async () => {
    const row = await rowOf("notebooks", userId, notebookId);
    const info = row && notebookInfoSchema.safeParse(row.info);
    if (!row || row.deleted || !info?.success) return;
    const next = notebookInfoSchema.parse({ ...info.data, ...patch });
    await putRows("notebooks", [
      { ...row, info: next, editedAt: Date.now(), revision: row.revision + 1, pending: true, refused: false },
    ]);
    changed(userId);
  });
}

/** Gone from the device at once; from the server at the next send (with its pages and pictures). */
export function deleteNotebook(userId: string, notebookId: string): Promise<void> {
  return serial(userId, async () => {
    const row = await rowOf("notebooks", userId, notebookId);
    if (!row) return;
    const pages = (await rowsOf("notebookPages", userId)).filter((p) => p.notebookId === notebookId);
    const pageIds = new Set(pages.map((p) => p.id));
    const images = (await rowsOf("notebookImages", userId)).filter((i) => pageIds.has(i.pageId));
    await removeRows(
      "notebookImages",
      userId,
      images.map((i) => i.id),
    );
    await removeRows("notebookPages", userId, [...pageIds]);
    if (row.onServer) {
      await putRows("notebooks", [{ ...row, deleted: true, pending: true, revision: row.revision + 1 }]);
    } else {
      await removeRows("notebooks", userId, [notebookId]);
    }
    changed(userId);
  });
}

/** A new page at the end of the notebook. */
export function addPage(
  userId: string,
  notebookId: string,
  background: PageBackground = "pontilhado",
): Promise<string> {
  return serial(userId, async () => {
    const pages = (await rowsOf("notebookPages", userId))
      .filter((p) => p.notebookId === notebookId && !p.deleted)
      .map(toPage)
      .filter((p): p is LocalPage => p !== null);
    const position = Math.min(
      pages.reduce((max, p) => Math.max(max, p.position + 1), 0),
      9999,
    );
    const row = newPageRow(userId, notebookId, emptyPage(position, background), Date.now());
    await putRows("notebookPages", [row]);
    changed(userId);
    return row.id;
  });
}

/**
 * Changes a page. `trusted`: the editor's own content (each stroke made by finishStroke), saved
 * as it is: checking 2,000 strokes on every save would stall the pen.
 */
export function updatePage(
  userId: string,
  pageId: string,
  patch: Partial<PageContent>,
  options: { trusted?: boolean } = {},
): Promise<void> {
  return serial(userId, async () => {
    const row = await rowOf("notebookPages", userId, pageId);
    if (!row || row.deleted) return;
    let next: PageContent;
    if (options.trusted) {
      // What is stored was checked when written; only the shape is looked at here.
      const stored = row.content as Partial<PageContent> | null;
      if (!stored || !Array.isArray(stored.strokes) || !Array.isArray(stored.elements)) return;
      next = { ...(stored as PageContent), ...patch };
    } else {
      const content = pageContentSchema.safeParse(row.content);
      if (!content.success) return;
      next = pageContentSchema.parse({ ...content.data, ...patch });
    }
    await putRows("notebookPages", [
      { ...row, content: next, editedAt: Date.now(), revision: row.revision + 1, pending: true, refused: false },
    ]);
    changed(userId);
  });
}

export function deletePage(userId: string, pageId: string): Promise<void> {
  return serial(userId, async () => {
    const row = await rowOf("notebookPages", userId, pageId);
    if (!row) return;
    const images = (await rowsOf("notebookImages", userId)).filter((i) => i.pageId === pageId);
    await removeRows(
      "notebookImages",
      userId,
      images.map((i) => i.id),
    );
    if (row.version > 0) {
      await putRows("notebookPages", [{ ...row, deleted: true, pending: true, revision: row.revision + 1 }]);
    } else {
      await removeRows("notebookPages", userId, [pageId]);
    }
    changed(userId);
  });
}

/** Keeps a picture (already compressed) for a page; it goes up with the next send. */
export function addImage(userId: string, pageId: string, blob: Blob): Promise<string> {
  return serial(userId, async () => {
    const id = crypto.randomUUID();
    await putRows("notebookImages", [{ userId, id, pageId, blob, mimeType: blob.type, sent: false }]);
    changed(userId);
    return id;
  });
}

/**
 * A picture of a page, from the device or, the first time on this device, downloaded and kept here
 * (so it opens offline next time). Null when it can't be had now (offline, or gone).
 */
export async function loadImage(userId: string, pageId: string, imageId: string): Promise<Blob | null> {
  const local = await getImageBlob(userId, imageId);
  if (local instanceof Blob) return local;
  if (typeof navigator !== "undefined" && !navigator.onLine) return null;
  const { data, error } = await getSupabase().storage.from(IMAGES_BUCKET).download(`${userId}/${imageId}`);
  if (error || !data) return null;
  await serial(userId, () =>
    putRows("notebookImages", [{ userId, id: imageId, pageId, blob: data, mimeType: data.type, sent: true }]),
  );
  return data;
}

/** Pages open in the editor: their undo may still bring a picture back. */
const held = new Set<string>();

/**
 * The editor holds its page while open. On release, a send is asked for: pictures that left the
 * page are freed then (see pruneImages).
 */
export function holdPage(userId: string, pageId: string): () => void {
  held.add(pageId);
  return () => {
    held.delete(pageId);
    changed(userId);
  };
}

/** The pictures a page's content shows. */
function imagesOf(content: unknown): Set<string> {
  const elements = (content as { elements?: unknown } | null)?.elements;
  const ids = new Set<string>();
  if (Array.isArray(elements))
    for (const e of elements) {
      const imageId = (e as { type?: unknown; imageId?: unknown } | null)?.imageId;
      if ((e as { type?: unknown }).type === "imagem" && typeof imageId === "string") ids.add(imageId);
    }
  return ids;
}

/**
 * Pictures that left their page (erased with the lasso, an insert undone) stop counting in the
 * 250 MB. Run with every send, after the server's copy was read back; never on a page open in the
 * editor. Only pictures this device knows: one pasted on another device may not have reached its
 * page here yet.
 */
async function pruneImages(userId: string, supabase: Supabase) {
  const pages = new Map((await rowsOf("notebookPages", userId)).map((p) => [p.id, p]));
  const unused = (await rowsOf("notebookImages", userId)).filter((image) => {
    const page = pages.get(image.pageId);
    return page && !page.deleted && !held.has(image.pageId) && !imagesOf(page.content).has(image.id);
  });
  if (unused.length === 0) return;
  await serial(userId, () =>
    removeRows(
      "notebookImages",
      userId,
      unused.filter((i) => !i.sent).map((i) => i.id),
    ),
  );
  const sent = unused.filter((i) => i.sent);
  if (sent.length === 0) return;
  const removed = await supabase.storage.from(IMAGES_BUCKET).remove(sent.map((i) => storagePath(userId, i.id)));
  if (removed.error) return;
  const deleted = await supabase
    .from("notebook_images")
    .delete()
    .in(
      "id",
      sent.map((i) => i.id),
    );
  stopIfOffline(deleted);
  if (deleted.error) return;
  await serial(userId, () =>
    removeRows(
      "notebookImages",
      userId,
      sent.map((i) => i.id),
    ),
  );
}

// --- Sending and reading back ------------------------------------------------------------

export interface SyncResult {
  status: "ok" | "offline" | "failed";
  /** Her changes that lost to a newer one from another device. */
  overwritten: number;
  /** Pages the server refused (too big). */
  refused: number;
  /** A picture didn't fit in the 250 MB. */
  quotaFull: boolean;
}

class Offline extends Error {}

type Supabase = ReturnType<typeof getSupabase>;
interface Failure {
  status: number;
  error: { code?: string; message: string } | null;
}

/** No answer at all: offline, stop here and try again later. */
function stopIfOffline(result: Failure) {
  if (result.error && result.status === 0) throw new Offline();
}

/** Errors that would happen again on every try: the row is not sent again until it changes. */
const REFUSED_CODES = new Set(["23514", "22023", "22P02", "54000"]);

const iso = (ms: number) => new Date(ms).toISOString();

async function pushNotebooks(userId: string, supabase: Supabase, result: SyncResult) {
  const waiting = (await rowsOf("notebooks", userId)).filter((r) => r.pending && !r.deleted && !r.refused);
  for (const row of waiting) {
    const info = notebookInfoSchema.safeParse(row.info);
    if (!info.success) continue;
    const sent = await supabase.rpc("save_notebook", {
      p_id: row.id,
      // Null means no subject; the generated types don't know a parameter can be null.
      p_subject: info.data.subjectId as string,
      p_title: info.data.title,
      p_edited_at: iso(row.editedAt),
    });
    stopIfOffline(sent);
    await serial(userId, async () => {
      const now = await rowOf("notebooks", userId, row.id);
      if (!now || now.deleted) return;
      if (sent.error) {
        // 23503: her subject was deleted elsewhere; reading back fixes it.
        if (REFUSED_CODES.has(sent.error.code ?? "")) await putRows("notebooks", [{ ...now, refused: true }]);
        else if (sent.error.code !== "23503") result.status = "failed";
        return;
      }
      const same = now.revision === row.revision;
      await putRows("notebooks", [{ ...now, onServer: true, pending: same ? false : now.pending }]);
    });
  }
}

async function pushPages(userId: string, supabase: Supabase, result: SyncResult) {
  const notebooks = new Map((await rowsOf("notebooks", userId)).map((n) => [n.id, n]));
  const waiting = (await rowsOf("notebookPages", userId)).filter(
    (r) => r.pending && !r.deleted && !r.refused && notebooks.get(r.notebookId)?.onServer,
  );
  for (const row of waiting) {
    const content = pageContentSchema.safeParse(row.content);
    if (!content.success) continue;
    const sent = await supabase.rpc("save_notebook_page", {
      p_id: row.id,
      p_notebook: row.notebookId,
      p_position: content.data.position,
      p_background: content.data.background,
      p_strokes: content.data.strokes,
      p_elements: content.data.elements,
      p_edited_at: iso(row.editedAt),
    });
    stopIfOffline(sent);
    await serial(userId, async () => {
      const now = await rowOf("notebookPages", userId, row.id);
      if (!now || now.deleted) return;
      if (sent.error) {
        if (REFUSED_CODES.has(sent.error.code ?? "")) {
          result.refused++;
          await putRows("notebookPages", [{ ...now, refused: true }]);
        } else if (sent.error.code !== "23503") {
          result.status = "failed";
        }
        return;
      }
      const saved = sent.data?.[0];
      // Not taken: the server has a newer change, read back below.
      if (!saved?.applied) return;
      const same = now.revision === row.revision;
      await putRows("notebookPages", [
        {
          ...now,
          version: saved.saved_version,
          pending: same ? false : now.pending,
          editedAt: same ? Date.parse(saved.saved_edited_at) : now.editedAt,
        },
      ]);
    });
  }
}

const storagePath = (userId: string, imageId: string) => `${userId}/${imageId}`;

async function pushImages(userId: string, supabase: Supabase, result: SyncResult) {
  const pages = new Map((await rowsOf("notebookPages", userId)).map((p) => [p.id, p]));
  const waiting = (await rowsOf("notebookImages", userId)).filter(
    (i) => !i.sent && (pages.get(i.pageId)?.version ?? 0) > 0,
  );
  for (const image of waiting) {
    const path = storagePath(userId, image.id);
    const registered = await supabase.from("notebook_images").insert({
      id: image.id,
      page_id: image.pageId,
      mime_type: image.mimeType,
      size_bytes: image.blob.size,
      storage_path: path,
    });
    stopIfOffline(registered);
    // 23505: registered by an earlier try whose answer was lost.
    if (registered.error && registered.error.code !== "23505") {
      if (registered.error.code === "LQ001") result.quotaFull = true;
      else result.status = "failed";
      continue;
    }
    const stored = await supabase.storage
      .from(IMAGES_BUCKET)
      .upload(path, image.blob, { contentType: image.mimeType, upsert: false });
    if (stored.error) {
      const already = /exists|duplicate/i.test(stored.error.message);
      if (!already) {
        if (!navigator.onLine) throw new Offline();
        result.status = "failed";
        continue;
      }
    }
    const done = await supabase
      .from("notebook_images")
      .update({ uploaded_at: new Date().toISOString() })
      .eq("id", image.id);
    stopIfOffline(done);
    await serial(userId, async () => {
      const now = await rowOf("notebookImages", userId, image.id);
      if (now) await putRows("notebookImages", [{ ...now, sent: true }]);
    });
  }
}

/** Removes the stored pictures first: deleting the rows alone would leave the files behind. */
async function removeStoredImages(supabase: Supabase, paths: string[]) {
  if (paths.length === 0) return;
  const removed = await supabase.storage.from(IMAGES_BUCKET).remove(paths);
  if (removed.error && !navigator.onLine) throw new Offline();
}

async function pushDeletions(userId: string, supabase: Supabase, result: SyncResult) {
  const pages = (await rowsOf("notebookPages", userId)).filter((p) => p.deleted && p.pending);
  for (const page of pages) {
    const images = await supabase.from("notebook_images").select("storage_path").eq("page_id", page.id);
    stopIfOffline(images);
    await removeStoredImages(
      supabase,
      (images.data ?? []).map((i) => i.storage_path),
    );
    const deleted = await supabase.from("notebook_pages").delete().eq("id", page.id);
    stopIfOffline(deleted);
    if (deleted.error) {
      result.status = "failed";
      continue;
    }
    await serial(userId, () => removeRows("notebookPages", userId, [page.id]));
  }
  const notebooks = (await rowsOf("notebooks", userId)).filter((n) => n.deleted && n.pending);
  for (const notebook of notebooks) {
    const images = await supabase
      .from("notebook_images")
      .select("storage_path, notebook_pages!inner(notebook_id)")
      .eq("notebook_pages.notebook_id", notebook.id);
    stopIfOffline(images);
    await removeStoredImages(
      supabase,
      (images.data ?? []).map((i) => i.storage_path),
    );
    const deleted = await supabase.from("notebooks").delete().eq("id", notebook.id);
    stopIfOffline(deleted);
    if (deleted.error) {
      result.status = "failed";
      continue;
    }
    await serial(userId, () => removeRows("notebooks", userId, [notebook.id]));
  }
}

const PAGE_SIZE = 1000;

/** Every row of a list, 1,000 at a time (the server's limit per answer). */
async function readAll<T>(
  read: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null; status: number }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const answer = await read(from, from + PAGE_SIZE - 1);
    stopIfOffline(answer);
    if (answer.error) throw new Error(answer.error.message);
    all.push(...(answer.data ?? []));
    if ((answer.data ?? []).length < PAGE_SIZE) return all;
  }
}

const CONTENT_BATCH = 25;

async function pull(userId: string, supabase: Supabase, result: SyncResult) {
  const serverNotebooks = await readAll<ServerNotebook>((from, to) =>
    supabase.from("notebooks").select("id, subject_id, title, edited_at, created_at").order("id").range(from, to),
  );
  const serverPages = await readAll<ServerPageMeta>((from, to) =>
    supabase.from("notebook_pages").select("id, notebook_id, version, edited_at").order("id").range(from, to),
  );

  const toFetch = await serial(userId, async () => {
    const notebooks = mergeNotebooks(userId, await rowsOf("notebooks", userId), serverNotebooks);
    await putRows("notebooks", notebooks.put);
    await removeRows("notebooks", userId, notebooks.remove);
    const gone = new Set(notebooks.remove);
    const localPages = await rowsOf("notebookPages", userId);
    // Pages of a notebook that is gone go with it.
    const orphans = localPages.filter((p) => gone.has(p.notebookId)).map((p) => p.id);
    const pages = mergePages(
      localPages.filter((p) => !gone.has(p.notebookId)),
      serverPages,
    );
    const removedPages = new Set([...orphans, ...pages.remove]);
    const images = (await rowsOf("notebookImages", userId)).filter((i) => removedPages.has(i.pageId));
    await removeRows(
      "notebookImages",
      userId,
      images.map((i) => i.id),
    );
    await removeRows("notebookPages", userId, [...removedPages]);
    result.overwritten += notebooks.overwritten.length + pages.overwritten.length;
    if (notebooks.put.length + notebooks.remove.length + removedPages.size > 0) changed(userId, "server");
    return pages.fetch;
  });

  for (let i = 0; i < toFetch.length; i += CONTENT_BATCH) {
    const ids = toFetch.slice(i, i + CONTENT_BATCH);
    const answer = await supabase
      .from("notebook_pages")
      .select("id, notebook_id, position, background, strokes, elements, version, edited_at")
      .in("id", ids);
    stopIfOffline(answer);
    if (answer.error) throw new Error(answer.error.message);
    await serial(userId, async () => {
      const notebooks = new Map((await rowsOf("notebooks", userId)).map((n) => [n.id, n]));
      const rows: NotebookPageRow[] = [];
      for (const s of answer.data ?? []) {
        if (notebooks.get(s.notebook_id)?.deleted !== false) continue;
        const content = pageContentSchema.safeParse(s);
        if (!content.success) continue;
        const editedAt = Date.parse(s.edited_at);
        const now = await rowOf("notebookPages", userId, s.id);
        if (now?.deleted) continue;
        // She changed it while this was being read, after the server's change: hers waits to go.
        if (now?.pending && !now.refused && now.editedAt >= editedAt) continue;
        rows.push({
          userId,
          id: s.id,
          notebookId: s.notebook_id,
          content: content.data,
          version: s.version,
          editedAt,
          revision: now?.revision ?? 0,
          pending: false,
          deleted: false,
        });
      }
      await putRows("notebookPages", rows);
      if (rows.length > 0) changed(userId, "server");
    });
  }
}

const running = new Map<string, { promise: Promise<SyncResult>; state: { again: boolean } }>();

/**
 * Sends what waits and reads the server's copy back. One at a time per person: a call while one
 * runs makes it go once more at the end (her change may have come after its reading).
 */
export function syncNotebooks(userId: string): Promise<SyncResult> {
  const current = running.get(userId);
  if (current) {
    current.state.again = true;
    return current.promise;
  }
  const state = { again: false };
  const promise = (async () => {
    let total: SyncResult = { status: "ok", overwritten: 0, refused: 0, quotaFull: false };
    do {
      state.again = false;
      const once = await syncOnce(userId);
      total = {
        status: once.status,
        overwritten: total.overwritten + once.overwritten,
        refused: total.refused + once.refused,
        quotaFull: total.quotaFull || once.quotaFull,
      };
    } while (state.again && total.status === "ok");
    return total;
  })().finally(() => running.delete(userId));
  running.set(userId, { promise, state });
  return promise;
}

async function syncOnce(userId: string): Promise<SyncResult> {
  const result: SyncResult = { status: "ok", overwritten: 0, refused: 0, quotaFull: false };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { ...result, status: "offline" };
  const supabase = getSupabase();
  try {
    await pushNotebooks(userId, supabase, result);
    await pushPages(userId, supabase, result);
    await pushImages(userId, supabase, result);
    await pushDeletions(userId, supabase, result);
    await pull(userId, supabase, result);
    await pruneImages(userId, supabase);
  } catch (error) {
    if (error instanceof Offline) return { ...result, status: "offline" };
    console.error("[lanima] sincronização do caderno:", error);
    return { ...result, status: "failed" };
  }
  return result;
}
