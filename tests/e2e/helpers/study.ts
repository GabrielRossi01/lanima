import { adminClient, seedReading, type TestAccount } from "./accounts";

/** Three pages of a reading, as the simulated AI reads them (one title line, then sentences). */
export const PAGES = [
  "Sistema esquelético\nO esqueleto humano adulto tem 206 ossos. O esqueleto axial reúne 80 ossos.",
  "Tecido ósseo\nOs osteoblastos produzem a matriz óssea. Os osteoclastos reabsorvem o osso.",
  "Ossificação\nA ossificação endocondral substitui a cartilagem hialina por osso.",
];

/** The summary the simulated AI makes from PAGES, saved straight to the database. */
export async function seedSummary(
  account: TestAccount,
  input: { fileName: string; subjectId?: string | null },
): Promise<{ summaryId: string; documentId: string }> {
  const { documentId } = await seedReading(account, {
    name: `${input.fileName}.pdf`,
    subjectId: input.subjectId ?? null,
    pages: PAGES,
  });
  const fonte = (pagina: number) => ({ documentId, pagina });
  const content = {
    titulo: "Sistema esquelético",
    topicos: [
      {
        id: "t0",
        titulo: "Sistema esquelético",
        pontos: [
          { id: "p0", texto: "O esqueleto humano adulto tem 206 ossos.", fonte: fonte(1) },
          { id: "p1", texto: "O esqueleto axial reúne 80 ossos.", fonte: fonte(1) },
        ],
      },
      {
        id: "t1",
        titulo: "Tecido ósseo",
        pontos: [
          { id: "p2", texto: "Os osteoblastos produzem a matriz óssea.", fonte: fonte(2) },
          { id: "p3", texto: "Os osteoclastos reabsorvem o osso.", fonte: fonte(2) },
        ],
      },
      {
        id: "t2",
        titulo: "Ossificação",
        pontos: [
          { id: "p4", texto: "A ossificação endocondral substitui a cartilagem hialina por osso.", fonte: fonte(3) },
        ],
      },
    ],
    termosChave: [{ termo: "Sistema esquelético", definicao: "O esqueleto humano adulto tem 206 ossos." }],
    pontosDeAtencao: [],
  };
  const { data, error } = await adminClient()
    .from("summaries")
    .insert({
      user_id: account.id,
      subject_id: input.subjectId ?? null,
      title: content.titulo,
      document_ids: [documentId],
      content,
      detail: "completo",
      provider: "mock",
    })
    .select("id")
    .single();
  if (error) throw error;
  return { summaryId: data.id, documentId };
}

/** An approved question of her bank (written by hand, so no source needed). */
export async function seedBankQuestion(
  account: TestAccount,
  input: { subjectId: string; topic: string; difficulty: "facil" | "medio" | "dificil"; statement: string },
) {
  const { error } = await adminClient()
    .from("questions")
    .insert({
      user_id: account.id,
      subject_id: input.subjectId,
      topic: input.topic,
      difficulty: input.difficulty,
      type: "multipla_escolha",
      statement: input.statement,
      options: ["Certa", "Errada 1", "Errada 2", "Errada 3"],
      answer: { index: 0 },
      explanation: "Porque sim.",
      status: "aprovada",
      origin: "manual",
    });
  if (error) throw error;
}

/**
 * A saved test with one question of each kind, in this order: multiple choice (206), true/false
 * (true), matching, clinical case (first option) and short answer. Options are not shuffled.
 */
export async function seedTest(
  account: TestAccount,
  input: { subjectId: string; mode?: "treino" | "prova"; timeLimitMin?: number | null; title?: string },
): Promise<{ testId: string; questionIds: string[] }> {
  const admin = adminClient();
  const base = {
    user_id: account.id,
    subject_id: input.subjectId,
    status: "aprovada",
    origin: "manual",
    explanation: "",
  };
  const rows = [
    {
      ...base,
      topic: "Ossos",
      difficulty: "facil",
      type: "multipla_escolha",
      statement: "Quantos ossos tem o esqueleto adulto?",
      options: ["196", "206", "216", "226"],
      answer: { index: 1 },
      explanation: "O esqueleto adulto tem 206 ossos.",
    },
    {
      ...base,
      topic: "Ossos",
      difficulty: "facil",
      type: "verdadeiro_falso",
      statement: "O fêmur é o maior osso do corpo humano.",
      options: null,
      answer: { value: true },
    },
    {
      ...base,
      topic: "Células",
      difficulty: "medio",
      type: "associacao",
      statement: "Associe cada célula à sua função.",
      options: {
        left: ["Osteoblasto", "Osteoclasto", "Osteócito"],
        right: ["Reabsorve osso", "Mantém a matriz", "Forma matriz"],
      },
      answer: { match: [2, 0, 1] },
    },
    {
      ...base,
      topic: "Células",
      difficulty: "dificil",
      type: "caso_clinico",
      statement: "Paciente de 68 anos com fraturas após quedas leves. Qual desequilíbrio explica o quadro?",
      options: [
        "Reabsorção maior que a formação",
        "Formação maior que a reabsorção",
        "Falta de hematopoese",
        "Excesso de cálcio",
      ],
      answer: { index: 0 },
    },
    {
      ...base,
      topic: "Ossos",
      difficulty: "dificil",
      type: "resposta_curta",
      statement: "O que é a diáfise?",
      options: null,
      answer: { text: "O corpo do osso longo." },
    },
  ];
  const { data: questions, error } = await admin.from("questions").insert(rows).select("id, statement");
  if (error) throw error;
  const questionIds = rows.map((r) => questions.find((q) => q.statement === r.statement)!.id);
  const { data: test, error: testError } = await admin
    .from("tests")
    .insert({
      user_id: account.id,
      subject_id: input.subjectId,
      title: input.title ?? "Ossos · revisão",
      config: {
        counts: { facil: 2, medio: 1, dificil: 2 },
        mode: input.mode ?? "treino",
        timeLimitMin: input.timeLimitMin ?? null,
        shuffle: false,
      },
      question_ids: questionIds,
    })
    .select("id")
    .single();
  if (testError) throw testError;
  return { testId: test.id, questionIds };
}

/**
 * A finished attempt of a seeded test, graded by the database like one sent from the app.
 * `responses[i]` is the answer to question i (null: blank); `finishedAt` defaults to now.
 */
export async function seedFinishedAttempt(
  account: TestAccount,
  input: {
    testId: string;
    questionIds: string[];
    responses: (Record<string, unknown> | null)[];
    finishedAt?: Date;
  },
): Promise<{ attemptId: string; score: number }> {
  const admin = adminClient();
  const finishedAt = input.finishedAt ?? new Date();
  const attemptId = crypto.randomUUID();
  const { error } = await admin.from("test_attempts").insert({
    id: attemptId,
    user_id: account.id,
    test_id: input.testId,
    mode: "treino",
    question_ids: input.questionIds,
    started_at: new Date(finishedAt.getTime() - 5 * 60_000).toISOString(),
  });
  if (error) throw error;
  const { error: answersError } = await admin.from("attempt_answers").insert(
    input.questionIds.map((questionId, i) => ({
      user_id: account.id,
      attempt_id: attemptId,
      question_id: questionId,
      response: (input.responses[i] ?? null) as never,
    })),
  );
  if (answersError) throw answersError;
  const { data, error: doneError } = await admin
    .from("test_attempts")
    .update({ completed: true, finished_at: finishedAt.toISOString() })
    .eq("id", attemptId)
    .select("score")
    .single();
  if (doneError) throw doneError;
  return { attemptId, score: Number(data.score) };
}

export async function acceptAiNotice(account: TestAccount) {
  const { error } = await adminClient()
    .from("profiles")
    .update({ ai_notice_accepted_at: new Date().toISOString() })
    .eq("id", account.id);
  if (error) throw error;
}
