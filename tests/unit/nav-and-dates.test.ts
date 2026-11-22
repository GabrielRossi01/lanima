import { describe, expect, it } from "vitest";
import { isActivePath, MORE_NAV, PRIMARY_NAV, TAB_BAR_NAV } from "@/components/layout/nav-config";
import { initialsOf } from "@/components/ui/avatar";
import { greetingFor, longDate } from "@/lib/dates/greeting";

describe("navegação", () => {
  it("menu lateral segue a ordem da seção 4.4", () => {
    expect(PRIMARY_NAV.map((n) => n.label)).toEqual([
      "Início",
      "Matérias",
      "Caderno",
      "Resumos e testes",
      "Atlas 3D",
      "Modo foco",
      "Extensão",
      "Arquivos",
      "Grupo e ranking",
    ]);
  });

  it("barra inferior tem Início, Matérias, Foco e Ranking, e o resto vai para Mais", () => {
    expect(TAB_BAR_NAV.map((n) => n.label)).toEqual(["Início", "Matérias", "Foco", "Ranking"]);
    expect(MORE_NAV.map((n) => n.href)).toEqual(["/caderno", "/estudo", "/atlas", "/extensao", "/arquivos"]);
  });

  it("subrotas mantêm o item ativo, mas prefixos parecidos não", () => {
    expect(isActivePath("/materias/123", "/materias")).toBe(true);
    expect(isActivePath("/materias", "/materias")).toBe(true);
    expect(isActivePath("/materiasx", "/materias")).toBe(false);
  });
});

describe("saudação e data", () => {
  const tz = "America/Sao_Paulo";

  it("muda conforme a hora em São Paulo", () => {
    expect(greetingFor(new Date("2026-11-21T11:00:00Z"), tz)).toBe("Bom dia"); // 08h
    expect(greetingFor(new Date("2026-11-21T17:00:00Z"), tz)).toBe("Boa tarde"); // 14h
    expect(greetingFor(new Date("2026-11-21T23:30:00Z"), tz)).toBe("Boa noite"); // 20h30
    expect(greetingFor(new Date("2026-11-21T05:00:00Z"), tz)).toBe("Boa noite"); // 02h
  });

  it("escreve a data por extenso como no mockup", () => {
    expect(longDate(new Date("2026-11-21T15:00:00Z"), tz)).toBe("Sábado, 21 de novembro");
  });
});

describe("iniciais do avatar", () => {
  it("usa primeira e última palavra", () => {
    expect(initialsOf("Maria Alves")).toBe("MA");
    expect(initialsOf("Júlia")).toBe("JÚ");
    expect(initialsOf("  Ana  de  Souza ")).toBe("AS");
    expect(initialsOf("")).toBe("");
  });
});
