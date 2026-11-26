import type { Detail, Difficulty, QuestionType } from "./schemas";

/**
 * Instructions for the AI (section 7.12). Each request also carries a "PEDIDO" line in JSON with
 * the exact numbers asked, which the model reads and the simulated provider of the tests parses.
 */

const RULES = `Regras que valem sempre:
- Use SOMENTE as informações dos trechos enviados. Não acrescente nada que não esteja neles, mesmo que seja verdade.
- Escreva em português do Brasil, com a terminologia correta de Biomedicina.
- Cada trecho começa com uma marca como [D1 p.3]: documento D1, página 3. Toda informação que você usar precisa citar o documento ("doc": "D1") e a página ("pagina": 3) de onde veio. Nunca invente um documento ou uma página.
- Não inclua dados pessoais nem comentários sobre a aluna.`;

const DETAIL_GUIDE: Record<Detail, string> = {
  curto: "Curto: só os pontos-chave, de 3 a 5 tópicos com até 4 pontos cada, sem subtópicos.",
  medio: "Médio: de 4 a 8 tópicos, com subtópicos quando o assunto pedir, e pontos objetivos.",
  completo:
    "Completo: cubra todo o conteúdo, com tópicos e subtópicos, mecanismos, classificações e exemplos do material.",
};

export function summarySystem(): string {
  return `Você organiza material de aula de Biomedicina em um resumo em tópicos para estudo.
${RULES}
- Os pontos são frases curtas e completas, uma ideia por ponto.
- "termosChave": termos técnicos do material com definição de uma frase, tirada do material.
- "pontosDeAtencao": confusões comuns, exceções e detalhes que costumam cair em prova, desde que estejam no material, cada um com a sua fonte.
- O "titulo" do resumo nomeia o assunto, sem a palavra "resumo".`;
}

export function summaryUser(input: { detail: Detail; focus: string | null; chunks: string }): string {
  const pedido = { tipo: "resumo", detalhe: input.detail, foco: input.focus };
  return `PEDIDO: ${JSON.stringify(pedido)}
Nível de detalhe — ${DETAIL_GUIDE[input.detail]}
${input.focus ? `Dê prioridade a: ${input.focus}.\n` : ""}
TRECHOS:
${input.chunks}`;
}

/** Joining the partial summaries of a big material (the "reduce" step). */
export function mergeUser(input: { detail: Detail; focus: string | null; partials: string }): string {
  const pedido = { tipo: "juntar", detalhe: input.detail, foco: input.focus };
  return `PEDIDO: ${JSON.stringify(pedido)}
Os resumos parciais abaixo são de partes do mesmo material, em ordem. Junte tudo em um único resumo, sem repetir pontos, mantendo para cada ponto o "doc" e a "pagina" que ele já tem.
Nível de detalhe — ${DETAIL_GUIDE[input.detail]}
${input.focus ? `Dê prioridade a: ${input.focus}.\n` : ""}
RESUMOS PARCIAIS (JSON):
${input.partials}`;
}

const LEVELS: Record<Difficulty, string> = {
  facil: "Fácil: lembrar e reconhecer. Definições, nomes, classificações.",
  medio:
    "Médio: compreender e aplicar. Relacionar conceitos, interpretar um exame ou uma figura descrita, explicar um mecanismo.",
  dificil:
    'Difícil: analisar. Caso clínico ou laboratorial curto, questão que integra dois tópicos, alternativa "pegadinha" plausível.',
};

const TYPES: Record<QuestionType, string> = {
  multipla_escolha: `multipla_escolha: "alternativas" com 4 ou 5 opções e "correta" com o índice (começando em 0) da única certa.`,
  caso_clinico: `caso_clinico: um caso curto no enunciado, com "alternativas" (4 ou 5) e "correta" como na múltipla escolha.`,
  verdadeiro_falso: `verdadeiro_falso: uma afirmação no enunciado e "verdadeiro" true ou false.`,
  associacao: `associacao: "pares" com 3 a 6 itens {esquerda, direita} já na associação certa (o app embaralha).`,
  resposta_curta: `resposta_curta: "respostaEsperada" com a resposta em até duas frases.`,
};

export function questionsSystem(): string {
  return `Você escreve questões de prova de Biomedicina a partir do material de aula.
${RULES}
- Cada questão cita a página de onde veio e um "trecho" curto (até 200 caracteres) copiado do material que a justifica.
- Exatamente uma alternativa correta. Distratores plausíveis, do mesmo tema, sem erros óbvios.
- Nunca use "todas as anteriores" nem "nenhuma das anteriores".
- "explicacao": de 1 a 3 frases, dizendo por que a resposta está certa.
- Preencha com null os campos que não são do tipo da questão.
- Não repita questões nem faça duas perguntas quase iguais.
- "topico": um dos tópicos pedidos, escrito igual.`;
}

export function questionsUser(input: {
  counts: Partial<Record<Difficulty, number>>;
  types: readonly QuestionType[];
  topics: readonly string[];
  avoid: readonly string[];
  chunks: string;
}): string {
  const levels = (Object.keys(input.counts) as Difficulty[]).filter((d) => (input.counts[d] ?? 0) > 0);
  const pedido = { tipo: "questoes", quantidades: input.counts, tipos: input.types, topicos: input.topics };
  return `PEDIDO: ${JSON.stringify(pedido)}
Escreva exatamente ${levels.map((d) => `${input.counts[d]} de nível ${d}`).join(", ")}.
${levels.map((d) => `- ${LEVELS[d]}`).join("\n")}
Tipos permitidos (distribua entre eles):
${input.types.map((t) => `- ${TYPES[t]}`).join("\n")}
${input.topics.length ? `Distribua as questões entre os tópicos: ${input.topics.join("; ")}.` : "Distribua as questões por todo o conteúdo."}
${input.avoid.length ? `Não repita estas questões que ela já tem:\n${input.avoid.map((s) => `- ${s}`).join("\n")}\n` : ""}
TRECHOS:
${input.chunks}`;
}

/** Second and last try, with what went wrong (section 7.12). */
export function retryNote(error: string): string {
  return `\n\nSua resposta anterior não passou na validação: ${error.slice(0, 500)}. Responda de novo, só com o JSON no formato pedido.`;
}
