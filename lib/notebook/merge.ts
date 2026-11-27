import type { NotebookPageRow, NotebookRow } from "@/lib/db/local";

/**
 * How the device's copy of the notebook meets the server's (section 6: version + last-write-wins
 * per page). Pure: lib/notebook/sync.ts reads both sides, calls this and applies the result.
 */

export interface ServerNotebook {
  id: string;
  subject_id: string | null;
  title: string;
  edited_at: string;
  created_at: string;
}

export interface ServerPageMeta {
  id: string;
  notebook_id: string;
  version: number;
  edited_at: string;
}

export interface NotebookMerge {
  /** Rows to write as the server has them (not pending). */
  put: NotebookRow[];
  /** Rows to remove from the device: deleted elsewhere, or deleted here and on the server. */
  remove: string[];
  /** Her changes made here that lost to a newer one from another device. */
  overwritten: string[];
}

export interface PageMerge {
  /** Pages whose content must be read from the server (new, or newer than here). */
  fetch: string[];
  remove: string[];
  overwritten: string[];
}

const ms = (iso: string) => Date.parse(iso);

export function serverNotebookRow(userId: string, s: ServerNotebook): NotebookRow {
  return {
    userId,
    id: s.id,
    info: { subjectId: s.subject_id, title: s.title, createdAt: ms(s.created_at) },
    editedAt: ms(s.edited_at),
    revision: 0,
    pending: false,
    deleted: false,
    onServer: true,
  };
}

export function mergeNotebooks(
  userId: string,
  local: readonly NotebookRow[],
  server: readonly ServerNotebook[],
): NotebookMerge {
  const out: NotebookMerge = { put: [], remove: [], overwritten: [] };
  const byId = new Map(local.map((l) => [l.id, l]));
  const onServer = new Set(server.map((s) => s.id));
  for (const s of server) {
    const l = byId.get(s.id);
    // Deleted here: the delete goes to the server, whatever changed there.
    if (l?.deleted) continue;
    if (l?.pending && !l.refused) {
      if (ms(s.edited_at) <= l.editedAt) continue;
      out.overwritten.push(s.id);
    }
    out.put.push({ ...serverNotebookRow(userId, s), revision: l?.revision ?? 0 });
  }
  for (const l of local) {
    if (onServer.has(l.id)) continue;
    // Never sent: it's new, it waits to go.
    if (!l.onServer) continue;
    // Was there and isn't any more: deleted (elsewhere, or her delete already landed).
    if (l.pending && !l.deleted) out.overwritten.push(l.id);
    out.remove.push(l.id);
  }
  return out;
}

export function mergePages(local: readonly NotebookPageRow[], server: readonly ServerPageMeta[]): PageMerge {
  const out: PageMerge = { fetch: [], remove: [], overwritten: [] };
  const byId = new Map(local.map((l) => [l.id, l]));
  const onServer = new Set(server.map((s) => s.id));
  for (const s of server) {
    const l = byId.get(s.id);
    if (!l) {
      out.fetch.push(s.id);
      continue;
    }
    if (l.deleted) continue;
    if (l.pending && !l.refused) {
      // Her change is the newest: it goes to the server, the server's is left behind.
      if (ms(s.edited_at) <= l.editedAt) continue;
      out.overwritten.push(s.id);
      out.fetch.push(s.id);
      continue;
    }
    // Changed elsewhere since this copy. (A page the server refused stays as she left it, until then.)
    if (s.version !== l.version) out.fetch.push(s.id);
  }
  for (const l of local) {
    if (onServer.has(l.id) || l.version === 0) continue;
    if (l.pending && !l.deleted) out.overwritten.push(l.id);
    out.remove.push(l.id);
  }
  return out;
}
