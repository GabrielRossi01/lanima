import Dexie, { type EntityTable } from "dexie";
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

type LocalDb = Dexie & {
  focusTimer: EntityTable<FocusTimerRow, "userId">;
  focusPrefs: EntityTable<FocusPrefsRow, "userId">;
};

let db: LocalDb | null | undefined;

/** null where IndexedDB doesn't exist (server, some private windows): callers keep working in memory. */
export function localDb(): LocalDb | null {
  if (db === undefined) {
    if (typeof indexedDB === "undefined") return (db = null);
    const created = new Dexie("lanima") as LocalDb;
    created.version(1).stores({ focusTimer: "userId", focusPrefs: "userId" });
    db = created;
  }
  return db;
}

function isSignedIn(userId: string): boolean {
  try {
    const last = JSON.parse(localStorage.getItem(LAST_USER_KEY) ?? "null") as { id?: string } | null;
    return last?.id === userId;
  } catch {
    return false;
  }
}

/** Runs a write for `userId`, unless she already signed out (a late write must not come back). */
export async function writeLocal(userId: string, write: (db: LocalDb) => Promise<unknown>): Promise<void> {
  const target = localDb();
  if (!target || !isSignedIn(userId)) return;
  try {
    await write(target);
  } catch {
    // Storage full or blocked: the state stays in memory for this visit.
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
