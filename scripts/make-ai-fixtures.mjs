// Writes the two sample PDFs of section 7.12 into tests/ai-fixtures/: Anatomia and Bioquímica,
// six pages each, text written for this project (no copyright). Run: node scripts/make-ai-fixtures.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts } from "pdf-lib";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "tests", "ai-fixtures");
mkdirSync(out, { recursive: true });
const FIXED = new Date("2026-11-27T12:00:00Z");

/** Breaks a paragraph into lines that fit the page. */
function wrap(text, font, size, width) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function book(name, pages) {
  const pdf = await PDFDocument.create();
  pdf.setCreationDate(FIXED);
  pdf.setModificationDate(FIXED);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const [title, paragraphs] of pages) {
    const page = pdf.addPage([595, 842]);
    let y = 770;
    page.drawText(title, { x: 60, y, size: 18, font: bold });
    y -= 36;
    for (const paragraph of paragraphs) {
      for (const line of wrap(paragraph, font, 11.5, 475)) {
        page.drawText(line, { x: 60, y, size: 11.5, font });
        y -= 17;
      }
      y -= 10;
    }
  }
  writeFileSync(join(out, name), await pdf.save({ useObjectStreams: false }));
}

await book("anatomia-sistema-esqueletico.pdf", [
  [
    "Sistema esquelético: visão geral",
    [
      "O esqueleto humano adulto tem 206 ossos, divididos em esqueleto axial e esqueleto apendicular. O axial reúne 80 ossos: crânio, ossículos da audição, hioide, coluna vertebral, costelas e esterno. O apendicular soma 126 ossos dos membros e das cinturas escapular e pélvica.",
      "As funções do esqueleto incluem sustentação do corpo, proteção de órgãos, apoio aos movimentos com os músculos, reserva de cálcio e fósforo e produção de células do sangue na medula óssea vermelha (hematopoese).",
    ],
  ],
  [
    "Classificação dos ossos",
    [
      "Pela forma, os ossos são longos, curtos, planos, irregulares, sesamoides ou pneumáticos. Ossos longos, como o fêmur e o úmero, têm o comprimento maior que a largura e a espessura.",
      "O osso longo tem a diáfise, que é o corpo, e as epífises, que são as extremidades. Entre elas fica a metáfise, onde no osso jovem está a placa epifisária, responsável pelo crescimento em comprimento.",
      "A patela é o maior osso sesamoide do corpo: ela se forma dentro do tendão do músculo quadríceps femoral. Os ossos pneumáticos, como o maxilar e o etmoide, têm cavidades com ar, os seios paranasais.",
    ],
  ],
  [
    "Tecido ósseo",
    [
      "O tecido ósseo tem uma matriz orgânica, rica em colágeno tipo I, e uma matriz inorgânica, formada principalmente por cristais de hidroxiapatita, que dão dureza ao osso.",
      "Os osteoblastos produzem a matriz óssea. Quando ficam presos nela, passam a se chamar osteócitos, que mantêm o tecido. Os osteoclastos, células multinucleadas de origem monocítica, reabsorvem o osso.",
      "O osso compacto se organiza em ósteons, ou sistemas de Havers, com lamelas concêntricas em volta de um canal central. O osso esponjoso forma trabéculas e abriga a medula óssea vermelha.",
    ],
  ],
  [
    "Ossificação e remodelação",
    [
      "A ossificação intramembranosa forma osso direto a partir do mesênquima: é assim que se formam os ossos planos do crânio e a clavícula. A ossificação endocondral substitui um molde de cartilagem hialina por osso, como nos ossos longos.",
      "O osso é remodelado a vida toda. O paratormônio aumenta a reabsorção e eleva o cálcio no sangue; a calcitonina tem efeito oposto. A vitamina D aumenta a absorção intestinal de cálcio.",
      "Na osteoporose, a reabsorção supera a formação, a massa óssea cai e o risco de fratura aumenta, principalmente no colo do fêmur, nas vértebras e no punho.",
    ],
  ],
  [
    "Coluna vertebral e caixa torácica",
    [
      "A coluna tem 7 vértebras cervicais, 12 torácicas e 5 lombares, além do sacro e do cóccix. O atlas (C1) não tem corpo vertebral e se articula com o crânio; o áxis (C2) tem o dente, em volta do qual o atlas gira.",
      "As curvaturas normais são a lordose cervical, a cifose torácica, a lordose lombar e a cifose sacral. Elas distribuem o peso e amortecem impactos.",
      "São 12 pares de costelas: 7 verdadeiras, que se ligam ao esterno pela própria cartilagem; 3 falsas, que se ligam pela cartilagem da costela de cima; e 2 flutuantes, sem ligação anterior.",
    ],
  ],
  [
    "Articulações",
    [
      "Pela estrutura, as articulações são fibrosas, cartilagíneas ou sinoviais. As suturas do crânio são fibrosas; a sínfise púbica é cartilagínea; o joelho é sinovial.",
      "As articulações sinoviais têm cápsula articular, membrana sinovial, líquido sinovial e cartilagem articular. São as que permitem mais movimento, como a do ombro, do tipo esferoide.",
    ],
  ],
]);

await book("bioquimica-enzimas.pdf", [
  [
    "Enzimas: o que são",
    [
      "Enzimas são catalisadores biológicos, quase sempre proteínas, que aceleram reações químicas sem serem consumidas. Elas diminuem a energia de ativação da reação, mas não alteram o equilíbrio nem a variação de energia livre.",
      "Algumas moléculas de RNA também catalisam reações: são as ribozimas, como o RNA ribossômico que forma a ligação peptídica.",
    ],
  ],
  [
    "Sítio ativo e especificidade",
    [
      "O substrato se liga ao sítio ativo, uma região da enzima formada por poucos aminoácidos. O modelo chave-fechadura propõe encaixe rígido; o modelo do encaixe induzido, mais aceito, propõe que a enzima muda de forma ao ligar o substrato.",
      "Muitas enzimas precisam de cofatores: íons metálicos, como o zinco e o magnésio, ou coenzimas orgânicas derivadas de vitaminas, como o NAD+, derivado da niacina, e o FAD, derivado da riboflavina.",
      "A enzima sem o cofator é a apoenzima; com o cofator, forma a holoenzima, que é a forma ativa.",
    ],
  ],
  [
    "Cinética enzimática",
    [
      "No modelo de Michaelis-Menten, a velocidade da reação aumenta com a concentração de substrato até chegar à velocidade máxima, a Vmax, quando a enzima está saturada.",
      "A constante de Michaelis, Km, é a concentração de substrato em que a velocidade é metade da Vmax. Um Km baixo indica alta afinidade da enzima pelo substrato.",
      "O gráfico de Lineweaver-Burk usa os inversos da velocidade e da concentração de substrato e transforma a hipérbole em reta, facilitando a leitura de Km e Vmax.",
    ],
  ],
  [
    "Fatores que alteram a atividade",
    [
      "Cada enzima tem temperatura e pH ótimos. Acima da temperatura ótima, a enzima se desnatura e perde a atividade. A pepsina, do estômago, atua em pH perto de 2; a tripsina, do intestino, em pH perto de 8.",
      "A concentração de enzima também importa: com substrato em excesso, a velocidade é proporcional à quantidade de enzima.",
    ],
  ],
  [
    "Inibição enzimática",
    [
      "Na inibição competitiva, o inibidor se parece com o substrato e disputa o sítio ativo. O Km aparente aumenta e a Vmax não muda, porque o excesso de substrato vence o inibidor. Exemplo: o metotrexato compete com o di-hidrofolato.",
      "Na inibição não competitiva, o inibidor se liga em outro local da enzima. A Vmax diminui e o Km não muda.",
      "A inibição irreversível inativa a enzima de forma permanente, como o ácido acetilsalicílico, que acetila a ciclo-oxigenase.",
    ],
  ],
  [
    "Regulação e uso clínico",
    [
      "Enzimas alostéricas têm sítios regulatórios e curva sigmoide de velocidade. A fosfofrutocinase-1 é a principal enzima regulada da glicólise: o ATP a inibe e o AMP a ativa.",
      "Zimogênios são formas inativas ativadas por clivagem, como o tripsinogênio, ativado pela enteropeptidase no intestino.",
      "No laboratório clínico, enzimas no sangue ajudam no diagnóstico: a troponina não é enzima, mas a CK-MB sobe no infarto, e as transaminases ALT e AST sobem na lesão do fígado.",
    ],
  ],
]);

console.log("PDFs de exemplo em", out);
