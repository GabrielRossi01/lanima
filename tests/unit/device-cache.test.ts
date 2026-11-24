import { beforeEach, describe, expect, it } from "vitest";
import {
  CACHE_KEY,
  clearDeviceCache,
  deviceStorage,
  hasStoredSession,
  isPersistedKey,
  LAST_USER_KEY,
  sessionEnded,
} from "@/lib/query/device-cache";

describe("cópia das listas no aparelho", () => {
  beforeEach(() => localStorage.clear());

  it("só grava com alguém logado: uma gravação atrasada não volta depois de sair", () => {
    const storage = deviceStorage(localStorage);
    localStorage.setItem(LAST_USER_KEY, "{}");
    storage.setItem(CACHE_KEY, "dados");
    expect(storage.getItem(CACHE_KEY)).toBe("dados");

    localStorage.removeItem(LAST_USER_KEY);
    clearDeviceCache();
    storage.setItem(CACHE_KEY, "gravação atrasada");
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it("sabe quais listas são guardadas", () => {
    expect(isPersistedKey(["subjects", "u"])).toBe(true);
    expect(isPersistedKey(["goals", "u", "2026-11-10", "2026-11-29"])).toBe(true);
    expect(isPersistedKey(["profile", "u"])).toBe(false);
  });
});

describe("hasStoredSession", () => {
  it("reconhece a sessão guardada, inteira ou em partes", () => {
    expect(hasStoredSession("a=1; sb-abc-auth-token=base64-xyz")).toBe(true);
    expect(hasStoredSession("sb-abc-auth-token.0=base64-xyz; sb-abc-auth-token.1=w")).toBe(true);
  });

  it("não confunde o verificador do PKCE nem um cookie vazio com uma sessão", () => {
    expect(hasStoredSession("")).toBe(false);
    expect(hasStoredSession("sb-abc-auth-token=")).toBe(false);
    expect(hasStoredSession("sb-abc-auth-token-code-verifier=x; sb-abc-auth-token-flow-1-code-verifier=y")).toBe(false);
  });
});

describe("sessionEnded: apagar ou manter a cópia do aparelho", () => {
  const stored = "sb-abc-auth-token=base64-xyz";

  it("sair sempre apaga, mesmo sem rede", () => {
    expect(sessionEnded({ signedOut: true, online: true, cookies: stored })).toBe(true);
    expect(sessionEnded({ signedOut: true, online: false, cookies: stored })).toBe(true);
  });

  it("online e sem sessão no aparelho: terminou sozinha", () => {
    expect(sessionEnded({ signedOut: false, online: true, cookies: "" })).toBe(true);
  });

  it("sem conseguir confirmar, mantém: offline ou Supabase fora do ar", () => {
    expect(sessionEnded({ signedOut: false, online: true, cookies: stored })).toBe(false);
    expect(sessionEnded({ signedOut: false, online: false, cookies: stored })).toBe(false);
    expect(sessionEnded({ signedOut: false, online: false, cookies: "" })).toBe(false);
  });
});
