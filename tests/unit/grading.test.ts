import { describe, expect, it } from "vitest";
import {
  byLevel,
  byTopic,
  creditOf,
  durationLabel,
  isAnswered,
  isCorrect,
  optionOrder,
  pctLabel,
  pointsFor,
  scoreOf,
  wrongOnes,
  type GradableQuestion,
} from "@/lib/study/grading";

const mc: GradableQuestion = {
  id: "a",
  type: "multipla_escolha",
  difficulty: "facil",
  topic: "Ossos",
  options: ["196", "206", "216", "226"],
  answer: { index: 1 },
};
const vf: GradableQuestion = {
  id: "b",
  type: "verdadeiro_falso",
  difficulty: "facil",
  topic: "Ossos",
  options: null,
  answer: { value: true },
};
const assoc: GradableQuestion = {
  id: "c",
  type: "associacao",
  difficulty: "medio",
  topic: "Células",
  options: { left: ["a", "b"], right: ["B", "A"] },
  answer: { match: [1, 0] },
};
const short: GradableQuestion = {
  id: "d",
  type: "resposta_curta",
  difficulty: "dificil",
  topic: "Células",
  options: null,
  answer: { text: "O corpo do osso longo." },
};

describe("correção, com as regras do banco", () => {
  it("cada tipo", () => {
    expect(isCorrect(mc, { response: { index: 1 }, selfAssessment: null })).toBe(true);
    expect(isCorrect(mc, { response: { index: 0 }, selfAssessment: null })).toBe(false);
    expect(isCorrect(mc, undefined)).toBeNull();
    expect(isCorrect(vf, { response: { value: false }, selfAssessment: null })).toBe(false);
    expect(isCorrect(assoc, { response: { match: [1, 0] }, selfAssessment: null })).toBe(true);
    expect(isCorrect(assoc, { response: { match: [0, 1] }, selfAssessment: null })).toBe(false);
    expect(isCorrect(short, { response: { text: "x" }, selfAssessment: "acertei" })).toBe(true);
    expect(isCorrect(short, { response: { text: "x" }, selfAssessment: "parcial" })).toBeNull();
    expect(creditOf(short, { response: { text: "x" }, selfAssessment: "parcial" })).toBe(0.5);
  });

  it("nota: certa 1, parcial 0,5, errada ou em branco 0 (o mesmo caso do teste do banco: 62,5)", () => {
    const answers = {
      a: { response: { index: 1 }, selfAssessment: null },
      b: { response: { value: false }, selfAssessment: null },
      c: { response: { match: [1, 0] }, selfAssessment: null },
      d: { response: { text: "O corpo" }, selfAssessment: "parcial" as const },
    };
    expect(scoreOf([mc, vf, assoc, short], answers)).toBe(62.5);
    expect(scoreOf([mc, vf], {})).toBe(0);
    expect(wrongOnes([mc, vf, assoc, short], answers).map((q) => q.id)).toEqual(["b", "d"]);
  });

  it("respondida: associação só com todos os pares, resposta curta só com texto", () => {
    expect(isAnswered(assoc, { response: { match: [1, -1] }, selfAssessment: null })).toBe(false);
    expect(isAnswered(assoc, { response: { match: [1, 0] }, selfAssessment: null })).toBe(true);
    expect(isAnswered(short, { response: { text: "  " }, selfAssessment: null })).toBe(false);
  });

  it("embaralhar: a mesma ordem para a mesma tentativa; sem embaralhar, a original", () => {
    expect(optionOrder(mc, "t1", true)).toEqual(optionOrder(mc, "t1", true));
    expect([...optionOrder(mc, "t1", true)].sort()).toEqual([0, 1, 2, 3]);
    expect(optionOrder(mc, "t1", false)).toEqual([0, 1, 2, 3]);
  });
});

describe("resultado", () => {
  it("por tópico e por nível", () => {
    const answers = {
      a: { response: { index: 1 }, selfAssessment: null },
      c: { response: { match: [0, 1] }, selfAssessment: null },
    };
    expect(byTopic([mc, vf, assoc], answers)).toEqual([
      { label: "Ossos", right: 1, total: 2, pct: 50 },
      { label: "Células", right: 0, total: 1, pct: 0 },
    ]);
    expect(byLevel([mc, vf, assoc], answers).map((s) => [s.level, s.pct])).toEqual([
      ["facil", 50],
      ["medio", 0],
    ]);
  });

  it("pontos: 5, mais 3 com 70%; só a primeira tentativa do teste no dia", () => {
    const first = { id: "1", testId: "t", finishedAt: "2026-11-26T13:00:00Z", score: 80 };
    const again = { id: "2", testId: "t", finishedAt: "2026-11-26T15:00:00Z", score: 100 };
    const tomorrow = { id: "3", testId: "t", finishedAt: "2026-11-27T13:00:00Z", score: 60 };
    const all = [first, again, tomorrow];
    expect(pointsFor(first, all)).toBe(8);
    expect(pointsFor(again, all)).toBe(0);
    expect(pointsFor(tomorrow, all)).toBe(5);
  });

  it("rótulos", () => {
    expect(durationLabel(40_000)).toBe("40 s");
    expect(durationLabel(22 * 60_000)).toBe("22 min");
    expect(durationLabel(65 * 60_000)).toBe("1h 05min");
    expect(pctLabel(62.5)).toBe("62,5%");
    expect(pctLabel(70)).toBe("70%");
  });
});
