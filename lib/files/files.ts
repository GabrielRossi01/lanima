/**
 * Files (section 7.9): what can be uploaded, the limits and how they are shown. Pure functions, so
 * the screens and the tests share them.
 */

/** 25 MB per file, as the bucket (supabase/migrations/…_files_documents.sql). */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** 250 MB per account: the Free plan has 1 GB of Storage for everyone. */
export const QUOTA_BYTES = 250 * 1024 * 1024;
/** Errors raised by the database. */
export const QUOTA_ERROR = "LQ001";

export type FileKind = "pdf" | "foto" | "documento" | "slides";

export const KIND_LABELS: Record<FileKind, string> = {
  pdf: "PDF",
  foto: "Foto",
  documento: "Word",
  slides: "Slides",
};

export const MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
} as const;

/** What the "Escolher arquivos" picker offers. The old Office formats are offered to explain them. */
export const ACCEPT = [".pdf", ".docx", ".pptx", ".doc", ".ppt", "image/*", MIME.pdf, MIME.docx, MIME.pptx].join(",");

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "heic", "heif"];

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export type Accepted = { ok: true; kind: FileKind } | { ok: false; reason: string };

/** Whether a picked file can be uploaded, by type and size. */
export function checkFile(file: { name: string; type: string; size: number }): Accepted {
  const extension = extensionOf(file.name);
  const kind = kindOf(file.type, extension);
  if (!kind) {
    if (extension === "doc") return { ok: false, reason: "Arquivo .doc antigo: abra no Word e salve como .docx." };
    if (extension === "ppt")
      return { ok: false, reason: "Arquivo .ppt antigo: abra no PowerPoint e salve como .pptx." };
    return { ok: false, reason: "Tipo não aceito. Envie PDF, Word (.docx), slides (.pptx) ou fotos." };
  }
  if (file.size === 0) return { ok: false, reason: "O arquivo está vazio." };
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, reason: `Tem ${formatBytes(file.size)}: o limite é de 25 MB por arquivo.` };
  }
  return { ok: true, kind };
}

function kindOf(type: string, extension: string): FileKind | null {
  if (type === MIME.pdf || extension === "pdf") return "pdf";
  if (type === MIME.docx || extension === "docx") return "documento";
  if (type === MIME.pptx || extension === "pptx") return "slides";
  if (IMAGE_TYPES.includes(type) || IMAGE_EXTENSIONS.includes(extension)) return "foto";
  return null;
}

/** "380 KB", "4,2 MB", "1,2 GB", in pt-BR. */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit >= 2 && value < 10 ? 1 : 0;
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${units[unit]}`;
}

/** Cameras name every photo "image.jpg" or "IMG_1234.HEIC": those get a name that says when. */
export function photoName(original: string, takenAt: Date, extension: "webp" | "jpg"): string {
  const base = original.replace(/\.[^.]+$/, "").trim();
  const generic = base === "" || /^(image|img|photo|foto|pxl|dsc)[-_ ]?\d*$/i.test(base) || /^\d+$/.test(base);
  if (!generic) return `${base}.${extension}`;
  const day = takenAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const time = takenAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h");
  return `Foto ${day.replace("/", "-")} ${time}.${extension}`;
}

/** Name to show and save: trimmed, without characters that break downloads, up to 200. */
export function cleanName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 200);
}

/** Keeps the extension when renaming: "Aula 3" for "Slides.pdf" becomes "Aula 3.pdf". */
export function renamed(current: string, next: string): string {
  const extension = extensionOf(current);
  const base = cleanName(next).replace(new RegExp(`\\.${extension}$`, "i"), "");
  if (!base) return current;
  return extension ? `${base.slice(0, 199 - extension.length)}.${extension}` : base;
}

/** Filters of the list. Word and slides are both "Documentos". */
export type KindFilter = "todos" | "pdf" | "foto" | "documento";

export function matchesFilter(kind: FileKind, filter: KindFilter): boolean {
  if (filter === "todos") return true;
  if (filter === "documento") return kind === "documento" || kind === "slides";
  return kind === filter;
}

/** Where the file lives in the bucket. */
export function storagePath(userId: string, fileId: string): string {
  return `${userId}/${fileId}`;
}

export function hexOf(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 in hex, of bytes or of text. */
export async function sha256(data: ArrayBuffer | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return hexOf(await crypto.subtle.digest("SHA-256", bytes));
}
