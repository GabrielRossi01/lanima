import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import {
  DIFFICULTY_LABELS,
  QUESTION_TYPE_LABELS,
  type Difficulty,
  type QuestionType,
  type SummaryContent,
} from "@/lib/ai/schemas";
import { correctText } from "./grading";
import { pointNumber, type Highlight } from "./summary";

/**
 * "Exportar em PDF" (section 7.5), made on the device with pdf-lib: a clean one-column layout in
 * Fraunces + DM Sans, the sources of each page in its footer. Tests can have the answer key apart,
 * at the end. Without the fonts (offline before they were ever downloaded) it falls back to the
 * PDF standard fonts.
 */

export interface PdfFontFiles {
  serif: ArrayBuffer | Uint8Array;
  sans: ArrayBuffer | Uint8Array;
  sansBold: ArrayBuffer | Uint8Array;
}

interface Fonts {
  serif: PDFFont;
  sans: PDFFont;
  bold: PDFFont;
}

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = { x: 56, top: 60, bottom: 48 };
const WIDTH = PAGE.width - 2 * MARGIN.x;
const FOOT_LINE = 11;

const hex = (h: string): RGB =>
  rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

const C = {
  ink: hex("#1f2a33"),
  muted: hex("#60676b"),
  accent: hex("#3e5566"),
  line: hex("#dde0e0"),
  soft: hex("#eef2f5"),
  success: hex("#3c6d5c"),
};

const MARKER: Record<Highlight, RGB> = {
  amarelo: hex("#f7e38a"),
  rosa: hex("#f6bacb"),
  verde: hex("#bfe5cb"),
  celeste: hex("#b3d8f2"),
  lilas: hex("#d6c8f0"),
};

/** Characters the fonts may lack, and what to write instead. */
const REPLACE: Record<string, string> = { "↔": "–", "→": "–", "←": "–", "≥": ">=", "≤": "<=", "×": "x", "−": "-" };

interface Run {
  text: string;
  font: keyof Fonts;
  size: number;
  color?: RGB;
}

interface Line {
  runs: (Run & { x: number })[];
  height: number;
  indent: number;
  /** Fill behind the line (highlights, "Pontos de atenção"). */
  fill?: RGB;
  /** A ruled line to write on (short answers). */
  ruled?: boolean;
  /** Footnote keys this line cites: they go to the footer of the page it lands on. */
  refs?: string[];
}

class Writer {
  readonly doc: PDFDocument;
  private readonly fonts: Fonts;
  private readonly charsets = new Map<PDFFont, Set<number>>();
  private page!: PDFPage;
  private y = 0;
  private pageRefs: string[] = [];
  private readonly footnotes: { page: PDFPage; refs: string[] }[] = [];
  private readonly refNumber = new Map<string, number>();

  constructor(
    doc: PDFDocument,
    fonts: Fonts,
    private readonly refLabel: (key: string) => string,
  ) {
    this.doc = doc;
    this.fonts = fonts;
    this.newPage();
  }

  /** Text the font can draw: missing characters replaced, or dropped. */
  clean(text: string, font: keyof Fonts): string {
    const f = this.fonts[font];
    let set = this.charsets.get(f);
    if (!set) {
      set = new Set(f.getCharacterSet());
      this.charsets.set(f, set);
    }
    let out = "";
    // Line breaks become spaces; runs of spaces stay (the blanks of "(    ) Verdadeiro").
    for (const ch of text.normalize("NFC").replace(/[\t\r\n\f\v]+/g, " ")) {
      if (set.has(ch.codePointAt(0)!)) out += ch;
      else if (REPLACE[ch] && [...REPLACE[ch]].every((c) => set.has(c.codePointAt(0)!))) out += REPLACE[ch];
      else if (/\s/.test(ch)) out += " ";
    }
    return out;
  }

  width(text: string, font: keyof Fonts, size: number): number {
    return this.fonts[font].widthOfTextAtSize(text, size);
  }

  /** Word-wraps runs into lines `width` wide, the first line starting at `first` (a hanging label). */
  wrap(runs: Run[], opts: { width: number; lineHeight: number; indent?: number }): Line[] {
    const indent = opts.indent ?? 0;
    const lines: Line[] = [];
    let current: Line = { runs: [], height: opts.lineHeight, indent };
    let x = 0;
    const max = opts.width - indent;
    const push = () => {
      lines.push(current);
      current = { runs: [], height: opts.lineHeight, indent };
      x = 0;
    };
    for (const run of runs) {
      const text = this.clean(run.text, run.font);
      for (const piece of text.split(/(\s+)/)) {
        if (piece === "") continue;
        const space = /^\s+$/.test(piece);
        if (space && x === 0) continue;
        let word = piece;
        let w = this.width(word, run.font, run.size);
        if (!space && x > 0 && x + w > max) push();
        // A word longer than the line: cut it.
        while (!space && w > max) {
          let cut = word.length - 1;
          while (cut > 1 && this.width(word.slice(0, cut), run.font, run.size) > max - x) cut--;
          current.runs.push({ ...run, text: word.slice(0, cut), x });
          push();
          word = word.slice(cut);
          w = this.width(word, run.font, run.size);
        }
        if (space && x + w > max) continue;
        current.runs.push({ ...run, text: word, x });
        x += w;
      }
    }
    if (current.runs.length > 0 || lines.length === 0) push();
    return lines;
  }

  private footHeight(refs: readonly string[]): number {
    return refs.length === 0 ? 0 : 14 + refs.length * FOOT_LINE;
  }

  private newPage() {
    if (this.page) this.footnotes.push({ page: this.page, refs: this.pageRefs });
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - MARGIN.top;
    this.pageRefs = [];
  }

  /** Space left above the footer. */
  private room(extraRefs: readonly string[] = []): number {
    const refs = [...this.pageRefs, ...extraRefs.filter((r) => !this.pageRefs.includes(r))];
    return this.y - MARGIN.bottom - 18 - this.footHeight(refs);
  }

  /** Starts a new page unless `height` fits on this one. */
  keep(height: number) {
    if (this.room() < height) this.newPage();
  }

  gap(height: number) {
    if (this.room() > height) this.y -= height;
  }

  lines(lines: readonly Line[]) {
    for (const line of lines) {
      if (this.room(line.refs) < line.height) this.newPage();
      const top = this.y;
      const baseline = top - line.height + (line.height - Math.max(...line.runs.map((r) => r.size), 0)) / 2 + 2;
      if (line.fill) {
        this.page.drawRectangle({
          x: MARGIN.x + line.indent - 6,
          y: top - line.height,
          width: WIDTH - line.indent + 12,
          height: line.height,
          color: line.fill,
        });
      }
      if (line.ruled) {
        this.page.drawLine({
          start: { x: MARGIN.x + line.indent, y: top - line.height + 2 },
          end: { x: PAGE.width - MARGIN.x, y: top - line.height + 2 },
          thickness: 0.6,
          color: C.line,
        });
      }
      for (const run of line.runs) {
        this.page.drawText(run.text, {
          x: MARGIN.x + line.indent + run.x,
          y: baseline,
          size: run.size,
          font: this.fonts[run.font],
          color: run.color ?? C.ink,
        });
      }
      for (const ref of line.refs ?? []) if (!this.pageRefs.includes(ref)) this.pageRefs.push(ref);
      this.y -= line.height;
    }
  }

  text(runs: Run[], opts: { lineHeight: number; indent?: number; fill?: RGB; refs?: string[] }) {
    const lines = this.wrap(runs, { width: WIDTH, lineHeight: opts.lineHeight, indent: opts.indent });
    if (opts.fill) for (const l of lines) l.fill = opts.fill;
    // The footnote mark is at the end: the last line cites it.
    if (opts.refs?.length) lines[lines.length - 1].refs = opts.refs;
    this.lines(lines);
  }

  rule() {
    this.keep(12);
    this.page.drawLine({
      start: { x: MARGIN.x, y: this.y - 6 },
      end: { x: PAGE.width - MARGIN.x, y: this.y - 6 },
      thickness: 0.75,
      color: C.line,
    });
    this.y -= 12;
  }

  /** The number of a footnote, given in order of first use. */
  ref(key: string): number {
    let n = this.refNumber.get(key);
    if (n === undefined) {
      n = this.refNumber.size + 1;
      this.refNumber.set(key, n);
    }
    return n;
  }

  newSection() {
    this.newPage();
  }

  /** Footers (the sources of each page, and "Página N de M") once every page exists. */
  finish(footerLeft: string): void {
    this.footnotes.push({ page: this.page, refs: this.pageRefs });
    const total = this.footnotes.length;
    this.footnotes.forEach(({ page, refs }, i) => {
      let y = MARGIN.bottom + 4;
      const label = `Página ${i + 1} de ${total}`;
      page.drawText(this.clean(footerLeft, "sans"), { x: MARGIN.x, y, size: 8, font: this.fonts.sans, color: C.muted });
      page.drawText(label, {
        x: PAGE.width - MARGIN.x - this.width(label, "sans", 8),
        y,
        size: 8,
        font: this.fonts.sans,
        color: C.muted,
      });
      if (refs.length === 0) return;
      y += 14;
      for (const key of [...refs].reverse()) {
        let text = this.clean(`[${this.ref(key)}] ${this.refLabel(key)}`, "sans");
        while (text.length > 4 && this.width(text, "sans", 8) > WIDTH) text = `${text.slice(0, -2)}…`;
        page.drawText(text, { x: MARGIN.x, y, size: 8, font: this.fonts.sans, color: C.muted });
        y += FOOT_LINE;
      }
      page.drawLine({
        start: { x: MARGIN.x, y: y - 2 },
        end: { x: MARGIN.x + 120, y: y - 2 },
        thickness: 0.5,
        color: C.line,
      });
    });
  }
}

async function start(files: PdfFontFiles | null, title: string) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator("Lanima");
  doc.setProducer("Lanima");
  doc.setLanguage("pt-BR");
  let fonts: Fonts;
  if (files) {
    doc.registerFontkit(fontkit);
    // TrueType, subset to the glyphs used. Without ligatures: a "fi" glyph would copy as one wrong
    // character.
    const options = { subset: true, features: { liga: false } };
    fonts = {
      serif: await doc.embedFont(files.serif, options),
      sans: await doc.embedFont(files.sans, options),
      bold: await doc.embedFont(files.sansBold, options),
    };
  } else {
    fonts = {
      serif: await doc.embedFont(StandardFonts.TimesRomanBold),
      sans: await doc.embedFont(StandardFonts.Helvetica),
      bold: await doc.embedFont(StandardFonts.HelveticaBold),
    };
  }
  return { doc, fonts };
}

function header(w: Writer, title: string, meta: string) {
  w.text([{ text: title, font: "serif", size: 22 }], { lineHeight: 28 });
  w.gap(4);
  w.text([{ text: meta, font: "sans", size: 9.5, color: C.muted }], { lineHeight: 14 });
  w.gap(6);
  w.rule();
  w.gap(6);
}

export interface SummaryPdfInput {
  content: SummaryContent;
  /** "Anatomia · 26 de novembro de 2026". */
  meta: string;
  /** A source's name, by reading (document) id. */
  fileName: (documentId: string) => string | null;
}

const FOOTER = "Lanima · gerado por IA a partir dos seus arquivos. Confira com o material da aula.";

/** One PDF, written by `write`; sources are named with `fileName`. */
async function build(
  title: string,
  files: PdfFontFiles | null,
  fileName: (documentId: string) => string | null,
  write: (w: Writer) => void,
): Promise<Uint8Array> {
  const { doc, fonts } = await start(files, title);
  const w = new Writer(doc, fonts, (key) => {
    const [documentId, page] = key.split("#");
    return `${fileName(documentId) ?? "Arquivo"}, p. ${page}`;
  });
  write(w);
  w.finish(FOOTER);
  return doc.save();
}

export function summaryPdf(input: SummaryPdfInput, files: PdfFontFiles | null): Promise<Uint8Array> {
  return build(input.content.titulo, files, input.fileName, (w) => writeSummary(w, input));
}

function writeSummary(w: Writer, input: Omit<SummaryPdfInput, "fileName">) {
  const { content } = input;
  header(w, content.titulo, input.meta);

  const point = (p: SummaryContent["topicos"][number]["pontos"][number], label: string, indent: number) => {
    const key = p.fonte ? `${p.fonte.documentId}#${p.fonte.pagina}` : null;
    const runs: Run[] = [{ text: p.texto, font: "sans", size: 10.5 }];
    if (key) runs.push({ text: ` [${w.ref(key)}]`, font: "sans", size: 8.5, color: C.accent });
    const lines = w.wrap(runs, { width: WIDTH, lineHeight: 15, indent: indent + 30 });
    // The number hangs to the left of the first line.
    lines[0].runs.unshift({ text: label, font: "bold", size: 9.5, color: C.muted, x: -30 });
    if (p.destaque) for (const l of lines) l.fill = MARKER[p.destaque];
    if (key) lines[lines.length - 1].refs = [key];
    w.lines(lines);
    w.gap(3);
  };

  content.topicos.forEach((topic, t) => {
    w.keep(70);
    w.gap(8);
    w.text([{ text: `${t + 1}. ${topic.titulo}`, font: "serif", size: 15 }], { lineHeight: 21 });
    w.gap(4);
    topic.pontos.forEach((p, i) => point(p, pointNumber({ topic: t, sub: null, point: i }), 0));
    (topic.subtopicos ?? []).forEach((sub, s) => {
      w.keep(50);
      w.gap(6);
      w.text([{ text: `${t + 1}.${s + 1} ${sub.titulo}`, font: "bold", size: 11.5 }], { lineHeight: 17, indent: 0 });
      w.gap(2);
      sub.pontos.forEach((p, i) => point(p, pointNumber({ topic: t, sub: s, point: i }), 12));
    });
  });

  if (content.termosChave.length > 0) {
    w.keep(70);
    w.gap(12);
    w.text([{ text: "Termos-chave", font: "serif", size: 15 }], { lineHeight: 21 });
    w.gap(4);
    for (const term of content.termosChave) {
      w.text(
        [
          { text: `${term.termo}: `, font: "bold", size: 10.5 },
          { text: term.definicao, font: "sans", size: 10.5 },
        ],
        { lineHeight: 15 },
      );
      w.gap(4);
    }
  }

  if (content.pontosDeAtencao.length > 0) {
    w.keep(70);
    w.gap(12);
    w.text([{ text: "Pontos de atenção", font: "serif", size: 15 }], { lineHeight: 21 });
    w.gap(6);
    w.lines([{ runs: [], height: 6, indent: 0, fill: C.soft }]);
    for (const item of content.pontosDeAtencao) {
      w.text([{ text: `•  ${item}`, font: "sans", size: 10.5 }], { lineHeight: 15, fill: C.soft });
      w.lines([{ runs: [], height: 4, indent: 0, fill: C.soft }]);
    }
    w.lines([{ runs: [], height: 2, indent: 0, fill: C.soft }]);
  }
}

export interface PdfQuestion {
  id: string;
  type: QuestionType;
  difficulty: Difficulty;
  topic: string;
  statement: string;
  options: unknown;
  answer: unknown;
  explanation: string;
  source: { documentId: string; page: number } | null;
}

export interface TestPdfInput {
  title: string;
  meta: string;
  questions: readonly PdfQuestion[];
  /** The answer key on its own pages at the end. */
  answerKey: boolean;
  fileName: (documentId: string) => string | null;
}

const LETTERS = "ABCDEFGH";

function questionBody(w: Writer, q: PdfQuestion, n: number): Line[] {
  const lines: Line[] = [];
  const add = (runs: Run[], indent = 0, lineHeight = 15) =>
    lines.push(...w.wrap(runs, { width: WIDTH, lineHeight, indent }));
  add(
    [
      { text: `Questão ${n}`, font: "bold", size: 11 },
      {
        text: `  ·  ${DIFFICULTY_LABELS[q.difficulty]}  ·  ${QUESTION_TYPE_LABELS[q.type]}  ·  ${q.topic}`,
        font: "sans",
        size: 9,
        color: C.muted,
      },
    ],
    0,
    18,
  );
  add([{ text: q.statement, font: "sans", size: 10.5 }]);
  lines.push({ runs: [], height: 4, indent: 0 });
  if (q.type === "multipla_escolha" || q.type === "caso_clinico") {
    ((q.options as string[] | null) ?? []).forEach((option, i) => {
      const wrapped = w.wrap([{ text: option, font: "sans", size: 10.5 }], {
        width: WIDTH,
        lineHeight: 15,
        indent: 34,
      });
      wrapped[0].runs.unshift({ text: `${LETTERS[i]})`, font: "bold", size: 10.5, color: C.accent, x: -20 });
      lines.push(...wrapped);
    });
  } else if (q.type === "verdadeiro_falso") {
    add([{ text: "(    ) Verdadeiro        (    ) Falso", font: "sans", size: 10.5 }], 14);
  } else if (q.type === "associacao") {
    const { left = [], right = [] } = (q.options ?? {}) as { left?: string[]; right?: string[] };
    left.forEach((item, i) => add([{ text: `${i + 1}. ${item}`, font: "sans", size: 10.5 }], 14));
    lines.push({ runs: [], height: 4, indent: 0 });
    right.forEach((item) => add([{ text: `(    ) ${item}`, font: "sans", size: 10.5 }], 14));
  } else {
    for (let i = 0; i < 3; i++) lines.push({ runs: [], height: 24, indent: 14, ruled: true });
  }
  return lines;
}

export function testPdf(input: TestPdfInput, files: PdfFontFiles | null): Promise<Uint8Array> {
  return build(input.title, files, input.fileName, (w) => writeTest(w, input, "Gabarito"));
}

function writeTest(w: Writer, input: Omit<TestPdfInput, "fileName">, keyTitle: string) {
  header(w, input.title, input.meta);

  input.questions.forEach((q, i) => {
    const body = questionBody(w, q, i + 1);
    const height = body.reduce((s, l) => s + l.height, 0);
    // A question stays on one page when it fits on one.
    w.keep(Math.min(height, 260));
    w.lines(body);
    w.gap(14);
  });

  if (input.answerKey) {
    w.newSection();
    w.text([{ text: keyTitle, font: "serif", size: 20 }], { lineHeight: 26 });
    w.gap(10);
    input.questions.forEach((q, i) => {
      const key = q.source ? `${q.source.documentId}#${q.source.page}` : null;
      let answer = correctText(q, " – ");
      if (q.type === "multipla_escolha" || q.type === "caso_clinico") {
        const index = (q.answer as { index?: number } | null)?.index ?? -1;
        answer = `${LETTERS[index] ?? "?"}) ${answer}`;
      }
      w.keep(40);
      w.text(
        [
          { text: `${i + 1}.  `, font: "bold", size: 10.5 },
          { text: answer, font: "bold", size: 10.5, color: C.success },
        ],
        { lineHeight: 15 },
      );
      const runs: Run[] = q.explanation ? [{ text: q.explanation, font: "sans", size: 9.5, color: C.muted }] : [];
      if (key) runs.push({ text: ` [${w.ref(key)}]`, font: "sans", size: 8.5, color: C.accent });
      if (runs.length > 0) w.text(runs, { lineHeight: 13.5, indent: 18, refs: key ? [key] : undefined });
      w.gap(8);
    });
  }
}

export interface StudyPdfInput {
  /** "Anatomia · 26 de novembro de 2026", under the title "Resumos e testes". */
  meta: string;
  summaries: Omit<SummaryPdfInput, "fileName">[];
  tests: Omit<TestPdfInput, "fileName">[];
  fileName: (documentId: string) => string | null;
}

/**
 * "Resumos e testes em PDF" (Arquivos): a cover with the list, then each summary and each test on
 * new pages; a test's answer key, when asked, right after it.
 */
export function studyPdf(input: StudyPdfInput, files: PdfFontFiles | null): Promise<Uint8Array> {
  return build("Resumos e testes", files, input.fileName, (w) => {
    header(w, "Resumos e testes", input.meta);
    const entry = (label: string, title: string) =>
      w.text(
        [
          { text: `${label}  `, font: "bold", size: 9, color: C.muted },
          { text: title, font: "sans", size: 10.5 },
        ],
        { lineHeight: 16 },
      );
    for (const s of input.summaries) entry("RESUMO", s.content.titulo);
    for (const t of input.tests) entry("TESTE", t.title);
    for (const s of input.summaries) {
      w.newSection();
      writeSummary(w, s);
    }
    for (const t of input.tests) {
      w.newSection();
      writeTest(w, t, `Gabarito · ${t.title}`);
    }
  });
}

export { pdfFileName } from "./file-name";
