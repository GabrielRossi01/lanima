"use client";

import type { QueryClient } from "@tanstack/react-query";
import { saveReading } from "@/features/files/queries";
import { chunkPages, hashInput } from "@/lib/extract/text";
import { sha256 } from "@/lib/files/files";
import { pageText, type ImageElement } from "@/lib/notebook/model";
import { getPage, loadImage, syncNotebooks } from "@/lib/notebook/sync";
import { getSupabase } from "@/lib/supabase/client";
import { notebookDocumentsKey } from "./documents";

/**
 * "Usar no resumo" (section 7.2): the text of a page's text boxes and of its pasted pictures (OCR,
 * the same reader as Arquivos' photos) becomes a reading of that page, a source for summaries and
 * tests. Handwriting is not read in this version: in Portuguese the result is still poor.
 */

export class UseInSummaryError extends Error {}

export async function readPageForSummary(
  userId: string,
  pageId: string,
  queryClient: QueryClient,
  onProgress: (label: string) => void,
): Promise<string> {
  if (!navigator.onLine) {
    throw new UseInSummaryError("Sem internet agora. A página fica salva; use no resumo quando a conexão voltar.");
  }
  let page = await getPage(userId, pageId);
  if (!page) throw new UseInSummaryError("Página não encontrada.");
  // The reading points at the page on the server: it must have arrived there.
  if (page.version === 0) {
    onProgress("Enviando a página…");
    await syncNotebooks(userId);
    page = await getPage(userId, pageId);
    if (!page || page.version === 0) {
      throw new UseInSummaryError("A página ainda não chegou ao servidor. Tente de novo em instantes.");
    }
  }

  const parts = [pageText(page.elements)];
  const pictures = page.elements
    .filter((e): e is ImageElement => e.type === "imagem")
    .sort((a, b) => a.y - b.y || a.x - b.x);
  if (pictures.length > 0) {
    const { readFile } = await import("@/features/files/reader");
    for (const [i, picture] of pictures.entries()) {
      const label = pictures.length === 1 ? "Lendo a foto…" : `Lendo a foto ${i + 1} de ${pictures.length}…`;
      onProgress(label);
      const blob = await loadImage(userId, page.id, picture.imageId);
      if (!blob) continue;
      const reading = await readFile(blob, "foto", () => onProgress(label));
      parts.push(reading.pages.map((p) => p.text).join("\n\n"));
    }
  }
  const text = parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join("\n\n");
  if (!text) {
    throw new UseInSummaryError(
      "Esta página ainda não tem texto para o resumo. Escreva numa caixa de texto ou cole uma foto do material: a letra à mão ainda não é lida.",
    );
  }

  onProgress("Salvando o texto…");
  const supabase = getSupabase();
  const existing = await supabase.from("documents").select("id").eq("notebook_page_id", page.id).maybeSingle();
  if (existing.error) throw existing.error;
  let documentId = existing.data?.id;
  if (!documentId) {
    documentId = crypto.randomUUID();
    const created = await supabase.from("documents").insert({ id: documentId, notebook_page_id: page.id });
    if (created.error) throw created.error;
  }
  const chunks = chunkPages([{ page: 1, text }]);
  await saveReading({
    documentId,
    contentHash: await sha256(hashInput(chunks)),
    pageCount: 1,
    pagesApprox: false,
    usedOcr: pictures.length > 0,
    chunks,
  });
  await queryClient.invalidateQueries({ queryKey: notebookDocumentsKey(userId) });
  return documentId;
}
