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

export async function acceptAiNotice(account: TestAccount) {
  const { error } = await adminClient()
    .from("profiles")
    .update({ ai_notice_accepted_at: new Date().toISOString() })
    .eq("id", account.id);
  if (error) throw error;
}
