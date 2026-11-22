import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveTheme, THEME_COLORS, THEME_STORAGE_KEY, themeBootScript } from "@/lib/theme/theme";

describe("resolveTheme", () => {
  it("segue o sistema no modo automático", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("respeita a escolha manual", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });
});

describe("script de inicialização do tema", () => {
  let systemDark = false;

  beforeEach(() => {
    document.head.innerHTML = '<meta name="theme-color" content="#F5F6F5">';
    document.documentElement.removeAttribute("data-theme");
    localStorage.clear();
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("dark") ? systemDark : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function run() {
    new Function(themeBootScript())();
  }

  it("aplica o tema do sistema antes da primeira pintura", () => {
    systemDark = true;
    run();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.themePreference).toBe("system");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(THEME_COLORS.dark);
  });

  it("a escolha salva vence o sistema", () => {
    systemDark = true;
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    run();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.themePreference).toBe("light");
  });

  it("ignora valores inválidos no armazenamento", () => {
    systemDark = false;
    localStorage.setItem(THEME_STORAGE_KEY, "roxo");
    run();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.themePreference).toBe("system");
  });
});
