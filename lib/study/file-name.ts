/** "Ossos · revisão.pdf": a file name the systems accept. (Apart from pdf.ts, which loads pdf-lib.) */
export function pdfFileName(title: string): string {
  const clean = title
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${clean || "Lanima"}.pdf`;
}
