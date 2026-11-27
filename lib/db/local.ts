import Dexie, { type EntityTable, type Table } from "dexie";
import { LAST_USER_KEY } from "@/lib/query/device-cache";

/**
 * On-device database (section 6: what must work offline is written here first). Every row belongs
 * to a user, and everything is erased when the session ends. Rows are validated when read: they may
 * come from an older version of the app.
 */
export interface FocusTimerRow {
  userId: string;
  state: unknown;
}

export interface FocusPrefsRow {
  userId: string;
  prefs: unknown;
  /** Not confirmed by the server yet. */
  pending: boolean;
}

export interface FocusSessionRow {
  userId: string;
  /** Epoch ms: with the user, identifies the session. */
  startedAt: number;
  session: unknown;
  /** Already on the server. */
  sent: boolean;
}

/**
 * Her edits of a summary not yet on the server (section 6: outbox). One row per summary with the
 * newest content; `baseVersion` is the server version it was made on.
 */
export interface SummaryEditRow {
  userId: string;
  summaryId: string;
  content: unknown;
  baseVersion: number;
  /** Goes up with each edit: a send only clears the row if nothing changed meanwhile. */
  revision: number;
  /**
   * The send under way: if the app closes before its answer, the server may have taken it. Then the
   * server shows this version with this content, and it is hers, not a change from elsewhere.
   */
  sending?: { version: number; revision: number; hash: string };
}

/** A test attempt made on this device (section 6): written here first, sent when it's finished. */
export interface TestAttemptRow {
  userId: string;
  id: string;
  testId: string;
  attempt: unknown;
  /** Finished and already on the server. */
  sent: boolean;
}

/**
 * The notebook lives here (section 6): written first on the device, then sent. `pending` means a
 * change the server hasn't taken yet; `editedAt` is when she made it (the newest wins, per row).
 */
interface NotebookSyncFields {
  userId: string;
  id: string;
  /** Epoch ms of her last change. */
  editedAt: number;
  /** Goes up with each change: a send only clears `pending` if nothing changed meanwhile. */
  revision: number;
  pending: boolean;
  /** Deleted here; the row stays until the server deleted it too. */
  deleted: boolean;
  /** The server refused it for good (too big, invalid): kept, not sent again. */
  refused?: boolean;
}

export interface NotebookRow extends NotebookSyncFields {
  /** NotebookInfo (lib/notebook/model.ts). */
  info: unknown;
  /** Already on the server at least once. */
  onServer: boolean;
}

export interface NotebookPageRow extends NotebookSyncFields {
  notebookId: string;
  /** PageContent (lib/notebook/model.ts). */
  content: unknown;
  /** Server version this content is based on (0: never on the server). */
  version: number;
}

/** A picture pasted on a page, kept here until uploaded (and after, to open offline). */
export interface NotebookImageRow {
  userId: string;
  id: string;
  pageId: string;
  blob: Blob;
  mimeType: string;
  /** Registered and uploaded. */
  sent: boolean;
}

type LocalDb = Dexie & {
  focusTimer: EntityTable<FocusTimerRow, "userId">;
  focusPrefs: EntityTable<FocusPrefsRow, "userId">;
  focusSessions: Table<FocusSessionRow, [string, number]>;
  summaryEdits: Table<SummaryEditRow, [string, string]>;
  testAttempts: Table<TestAttemptRow, [string, string]>;
  notebooks: Table<NotebookRow, [string, string]>;
  notebookPages: Table<NotebookPageRow, [string, string]>;
  notebookImages: Table<NotebookImageRow, [string, string]>;
};

let db: LocalDb | null | undefined;

/** null where IndexedDB doesn't exist (server, some private windows): callers keep working in memory. */
export function localDb(): LocalDb | null {
  if (db === undefined) {
    if (typeof indexedDB === "undefined") return (db = null);
    const created = new Dexie("lanima") as LocalDb;
    created.version(1).stores({ focusTimer: "userId", focusPrefs: "userId" });
    created.version(2).stores({ focusSessions: "[userId+startedAt], userId" });
    created.version(3).stores({ summaryEdits: "[userId+summaryId], userId" });
    created.version(4).stores({ testAttempts: "[userId+id], userId, [userId+testId]" });
    created.version(5).stores({
      notebooks: "[userId+id], userId",
      notebookPages: "[userId+id], userId, [userId+notebookId]",
      notebookImages: "[userId+id], userId, [userId+pageId]",
    });
    db = created;
  }
  return db;
}

export function isSignedIn(userId: string): boolean {
  try {
    const last = JSON.parse(localStorage.getItem(LAST_USER_KEY) ?? "null") as { id?: string } | null;
    return last?.id === userId;
  } catch {
    return false;
  }
}

/**
 * Runs a write for `userId`, unless she already signed out (a late write must not come back).
 * Resolves to whether it was written: if not (storage full or blocked), the state stays in memory
 * for this visit.
 */
export async function writeLocal(userId: string, write: (db: LocalDb) => Promise<unknown>): Promise<boolean> {
  const target = localDb();
  if (!target || !isSignedIn(userId)) return false;
  try {
    await write(target);
    return true;
  } catch {
    return false;
  }
}

/** Reads, or undefined when there is nothing or the database can't be opened. */
export async function readLocal<T>(read: (db: LocalDb) => Promise<T>): Promise<T | undefined> {
  const target = localDb();
  if (!target) return undefined;
  try {
    return await read(target);
  } catch {
    return undefined;
  }
}

/** Erases everything kept here about whoever used the device. */
export async function clearLocalDb(): Promise<void> {
  const target = localDb();
  if (!target) return;
  try {
    await target.transaction("rw", target.tables, () => Promise.all(target.tables.map((table) => table.clear())));
  } catch {
    // Couldn't open it: nothing was saved there either.
  }
}
