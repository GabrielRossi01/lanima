import { describe, expect, it } from "vitest";
import { emptyForm, fromForm, toForm } from "@/lib/study/question-form";
import {
  configProblem,
  countsLabel,
  DEFAULT_CONFIG,
  initialSelection,
  minutesLabel,
  moreCounts,
  plan,
  testOrder,
  type BankQuestion,
} from "@/lib/study/test-config";

const q = (
  id: string,
  difficulty: BankQuestion["difficulty"],
  topic = "Ossos",
  type: BankQuestion["type"] = "multipla_escolha",
) => ({
  id,
  difficulty,
  topic,
  type,
});

describe("configuração do teste", () => {
  it("de 5 a 40 questões e pelo menos um tipo", () => {
    expect(configProblem(DEFAULT_CONFIG)).toBeNull();
    expect(configProblem({ ...DEFAULT_CONFIG, counts: { facil: 2, medio: 2, dificil: 0 } })).toBe(
      "Escolha pelo menos 5 questões.",
    );
    expect(configProblem({ ...DEFAULT_CONFIG, counts: { facil: 20, medio: 20, dificil: 1 } })).toBe(
      "No máximo 40 questões por teste.",
    );
    expect(configProblem({ ...DEFAULT_CONFIG, types: [] })).toBe("Escolha pelo menos um tipo de questão.");
  });

  it("rótulos do resumo do teste", () => {
    expect(countsLabel({ facil: 5, medio: 10, dificil: 1 })).toBe("5 fáceis · 10 médias · 1 difícil");
    expect(countsLabel({ facil: 0, medio: 1, dificil: 0 })).toBe("1 média");
    expect(minutesLabel({ facil: 5, medio: 10, dificil: 5 })).toBe("~24 min");
  });
});

describe("banco primeiro, a IA completa", () => {
  const bank = [
    q("a", "facil", "Ossos"),
    q("b", "facil", "Ossos"),
    q("c", "facil", "Tecido ósseo"),
    q("d", "medio", "Ossos", "verdadeiro_falso"),
    q("e", "dificil", "Articulações"),
  ];

  it("usa as do banco que servem, revezando os tópicos, e pede o resto", () => {
    const result = plan(bank, {
      ...DEFAULT_CONFIG,
      counts: { facil: 2, medio: 3, dificil: 1 },
      types: ["multipla_escolha"],
      topics: ["ossos", "Tecido ósseo"],
    });
    expect(result.fromBank.map((x) => x.id)).toEqual(["a", "c"]);
    expect(result.toGenerate).toEqual({ facil: 0, medio: 3, dificil: 1 });
  });

  it("sem tópicos marcados, vale qualquer tópico; desligado, não usa o banco", () => {
    expect(
      plan(bank, {
        ...DEFAULT_CONFIG,
        counts: { facil: 0, medio: 0, dificil: 1 },
        types: ["multipla_escolha"],
        topics: [],
      }).fromBank,
    ).toHaveLength(1);
    expect(plan(bank, { ...DEFAULT_CONFIG, useBank: false }).fromBank).toEqual([]);
  });

  it("seleção inicial: o pedido de cada nível; o resto fica para ela escolher", () => {
    const proposal = [q("1", "facil"), q("2", "facil"), q("3", "medio"), q("4", "medio"), q("5", "dificil")];
    expect([...initialSelection(proposal, { facil: 1, medio: 2, dificil: 0 })]).toEqual(["1", "3", "4"]);
    expect(testOrder([q("x", "dificil"), q("y", "facil"), q("z", "medio")])).toEqual(["y", "z", "x"]);
  });

  it("“Gerar mais 5” segue a proporção pedida", () => {
    expect(moreCounts({ facil: 5, medio: 10, dificil: 5 })).toEqual({ facil: 1, medio: 3, dificil: 1 });
    expect(moreCounts({ facil: 0, medio: 8, dificil: 0 })).toEqual({ facil: 0, medio: 5, dificil: 0 });
  });
});

describe("questão escrita ou editada à mão", () => {
  it("múltipla escolha: alternativas preenchidas, a certa contada entre elas", () => {
    const form = {
      ...emptyForm("multipla_escolha", "Ossos"),
      statement: "Quantos ossos tem o adulto?",
      options: ["196", "", "206", "216"],
      correct: 2,
    };
    expect(fromForm(form)).toEqual({
      ok: true,
      value: {
        type: "multipla_escolha",
        difficulty: "medio",
        topic: "Ossos",
        statement: "Quantos ossos tem o adulto?",
        options: ["196", "206", "216"],
        answer: { index: 1 },
        explanation: "",
      },
    });
  });

  it("recusa o que as regras não aceitam", () => {
    const base = { ...emptyForm("multipla_escolha", "Ossos"), statement: "Pergunta?", correct: 0 };
    expect(fromForm({ ...base, options: ["A", "Todas as anteriores"] })).toMatchObject({
      ok: false,
      errors: { options: expect.stringContaining("todas as anteriores") },
    });
    expect(fromForm({ ...base, options: ["A", "a"] })).toMatchObject({
      ok: false,
      errors: { options: "Há alternativas repetidas." },
    });
    expect(fromForm({ ...base, options: ["A", "B"], correct: null })).toMatchObject({
      ok: false,
      errors: { answer: "Marque a alternativa correta." },
    });
    expect(fromForm({ ...emptyForm("verdadeiro_falso"), statement: "Afirmação." })).toMatchObject({
      ok: false,
      errors: { topic: "Diga o tópico.", answer: expect.any(String) },
    });
  });

  it("associação: volta para o formulário com os pares certos", () => {
    const form = {
      ...emptyForm("associacao", "Células"),
      statement: "Associe as células às funções.",
      pairs: [
        { left: "Osteoblasto", right: "Forma matriz" },
        { left: "Osteoclasto", right: "Reabsorve" },
        { left: "Osteócito", right: "Mantém" },
      ],
    };
    const saved = fromForm(form);
    if (!saved.ok) throw new Error("devia passar");
    expect(saved.value.options).not.toEqual({
      left: form.pairs.map((p) => p.left),
      right: form.pairs.map((p) => p.right),
    });
    expect(toForm({ ...saved.value, options: saved.value.options, answer: saved.value.answer }).pairs).toEqual(
      form.pairs,
    );
  });
});
