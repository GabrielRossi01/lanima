"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { pagesLabel } from "@/lib/notebook/format";
import { summarizePagesHref } from "@/lib/study/links";
import { downloadNotebookPdf, makeNotebookPdf, shareNotebookPdf } from "../export-notebook";
import type { NotebookWithPages } from "../queries";
import { readPageForSummary, UseInSummaryError } from "../use-in-summary";
import { flushPage } from "./flush";

type Scope = "pagina" | "caderno";

/** "Exportar como PDF" and "Compartilhar" (Caderno.html): this page or the whole notebook. */
export function ExportSheet({
  open,
  mode,
  onClose,
  userId,
  notebook,
  pageId,
  pageNumber,
}: {
  open: boolean;
  mode: "baixar" | "compartilhar";
  onClose: () => void;
  userId: string;
  notebook: NotebookWithPages;
  pageId: string;
  pageNumber: number;
}) {
  const [scope, setScope] = useState<Scope>("pagina");
  const [busy, setBusy] = useState(false);
  const many = notebook.pages.length > 1;

  const run = async () => {
    setBusy(true);
    try {
      await flushPage(pageId);
      const whole = scope === "caderno" || !many;
      const pdf = await makeNotebookPdf(userId, {
        title: notebook.title,
        pageIds: whole ? notebook.pages.map((p) => p.id) : [pageId],
        pageNumber: whole ? undefined : pageNumber,
      });
      if (mode === "baixar") {
        downloadNotebookPdf(pdf);
        toast({ title: "PDF pronto", description: pdf.fileName, tone: "success" });
      } else {
        const how = await shareNotebookPdf(pdf, notebook.title);
        if (how === "baixado")
          toast({ title: "PDF baixado", description: "Este aparelho não compartilha arquivos: envie o PDF baixado." });
      }
      onClose();
    } catch (error) {
      console.error("[lanima] PDF do caderno:", error);
      toast({ title: "Não foi possível fazer o PDF", tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const Icon = mode === "baixar" ? Download : Share2;
  return (
    <Sheet
      open={open}
      onClose={busy ? () => {} : onClose}
      title={mode === "baixar" ? "Exportar como PDF" : "Compartilhar"}
      description="Os traços saem em vetor: nítidos em qualquer tamanho e na impressão."
      size="s"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button icon={Icon} onClick={() => void run()} disabled={busy}>
            {busy ? "Preparando o PDF…" : mode === "baixar" ? "Baixar PDF" : "Compartilhar PDF"}
          </Button>
        </>
      }
    >
      {many ? (
        <SegmentedControl
          label="O que entra no PDF"
          options={[
            { value: "pagina", label: `Esta página (${pageNumber})` },
            { value: "caderno", label: `Caderno inteiro (${pagesLabel(notebook.pages.length)})` },
          ]}
          value={scope}
          onChange={setScope}
        />
      ) : (
        <p className="type-body m-0 text-fg-2">O caderno tem uma página: ela vai inteira.</p>
      )}
    </Sheet>
  );
}

/**
 * "Usar no resumo" (section 7.2): the text of the page's boxes and pictures becomes a source; then
 * Resumos e testes opens with it chosen.
 */
export function UseInSummarySheet({
  open,
  onClose,
  userId,
  pageId,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  pageId: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const run = async () => {
    setProblem(null);
    setProgress("Preparando…");
    try {
      await flushPage(pageId);
      const documentId = await readPageForSummary(userId, pageId, queryClient, setProgress);
      onClose();
      router.push(summarizePagesHref([documentId]));
    } catch (error) {
      console.error("[lanima] usar no resumo:", error);
      setProblem(error instanceof UseInSummaryError ? error.message : "Não foi possível ler a página. Tente de novo.");
    } finally {
      setProgress(null);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={progress ? () => {} : onClose}
      title="Usar no resumo"
      size="s"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={progress !== null}>
            Cancelar
          </Button>
          <Button icon={FileText} onClick={() => void run()} disabled={progress !== null}>
            {progress ?? "Usar esta página"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="type-body m-0 text-fg-2">
          O texto das caixas de texto e das fotos coladas nesta página vira uma fonte para resumos e testes, como um
          arquivo.
        </p>
        <p className="type-caption m-0 text-fg-2">
          A letra à mão ainda não é lida: em português o resultado ainda é fraco. Para ela entrar, escreva o ponto numa
          caixa de texto.
        </p>
        {problem && (
          <p role="alert" className="type-body m-0 font-semibold text-danger-text">
            {problem}
          </p>
        )}
      </div>
    </Sheet>
  );
}
