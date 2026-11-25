import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clearLocalDb, localDb, readLocal, writeLocal } from "@/lib/db/local";
import { initialTimer } from "@/lib/focus/timer";
import { LAST_USER_KEY } from "@/lib/query/device-cache";

const signIn = (id: string) => localStorage.setItem(LAST_USER_KEY, JSON.stringify({ id, email: null }));
const saveTimer = (userId: string) => writeLocal(userId, (db) => db.focusTimer.put({ userId, state: initialTimer() }));

describe("banco do aparelho", () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearLocalDb();
  });

  it("guarda e lê por pessoa", async () => {
    signIn("ana");
    await saveTimer("ana");
    expect((await readLocal((db) => db.focusTimer.get("ana")))?.state).toEqual(initialTimer());
    expect(await readLocal((db) => db.focusTimer.get("bia"))).toBeUndefined();
  });

  it("uma gravação atrasada, depois de sair, é descartada", async () => {
    await saveTimer("ana");
    signIn("bia");
    await saveTimer("ana");
    expect(await localDb()!.focusTimer.count()).toBe(0);
  });

  it("sair apaga tudo", async () => {
    signIn("ana");
    await saveTimer("ana");
    await writeLocal("ana", (db) => db.focusPrefs.put({ userId: "ana", prefs: {}, pending: true }));
    await clearLocalDb();
    for (const table of localDb()!.tables) expect(await table.count(), table.name).toBe(0);
  });
});
