/** What she reads when a generation can't be done (section 7.5, "Estados e mensagens"). */

export type AiFailure = "limite" | "limite_app" | "ocupado" | "invalida" | "sem_texto" | "config" | "sessao" | "rede";

export const AI_MESSAGES: Record<AiFailure, { title: string; description: string }> = {
  limite: {
    title: "Você usou as gerações de hoje",
    description: "Amanhã libera de novo, e os testes salvos continuam disponíveis.",
  },
  limite_app: {
    title: "As gerações do Lanima acabaram por hoje",
    description:
      "O plano gratuito de IA é dividido entre todo mundo. Amanhã libera de novo; seus resumos e testes salvos continuam aqui.",
  },
  ocupado: {
    title: "O serviço de IA está ocupado",
    description: "Tente de novo em alguns minutos. Esta tentativa não gastou suas gerações.",
  },
  invalida: {
    title: "A IA respondeu fora do formato",
    description: "Tentamos duas vezes sem sucesso. Tente de novo; esta tentativa não gastou suas gerações.",
  },
  sem_texto: {
    title: "Sem texto legível",
    description: "Os arquivos escolhidos não têm texto para usar. Confira a prévia do texto em Arquivos.",
  },
  config: {
    title: "A IA não está configurada",
    description: "Falta a chave ou o modelo do provedor no servidor (veja o README).",
  },
  sessao: {
    title: "Sua sessão terminou",
    description: "Entre de novo para continuar.",
  },
  rede: {
    title: "Sem conexão",
    description: "Para gerar resumos e testes é preciso internet. Os testes salvos funcionam offline.",
  },
};

/** "Restam 3 gerações hoje". */
export function remainingLabel(n: number): string {
  if (n <= 0) return "Nenhuma geração restante hoje";
  return n === 1 ? "Resta 1 geração hoje" : `Restam ${n} gerações hoje`;
}
