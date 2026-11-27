"use client";

import { NotebookPen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-provider";
import type { SummaryContent } from "@/lib/ai/schemas";
import { cn } from "@/lib/cn";
import { pagesLabel } from "@/lib/notebook/format";
import { summaryToPages } from "@/lib/notebook/from-summary";
import { editorHref } from "@/lib/notebook/links";
import { newPageItemId } from "@/lib/notebook/model";
import { addPage, createNotebook, updatePage } from "@/lib/notebook/sync";
import { useNotebooks } from "./queries";

const NEW = "novo";

/**
 * "Salvar no caderno" of a summary (section 7.5): its topics become text boxes on new pages, in a
 * notebook she picks or a new one with the summary's name. Works offline (the notebook is local-first).
 */
export function SaveSummarySheet({
  open,
  onClose,
  content,
  subjectId,
}: {
  open: boolean;
  onClose: () => void;
  content: SummaryContent;
  subjectId: string | null;
}) {
  const router = useRouter();
  const userId = useAuth().user?.id;
  const notebooks = useNotebooks().data ?? [];
  // Her notebooks of the same subject first.
  const options = [...notebooks].sort(
    (a, b) => Number(b.subjectId === subjectId) - Number(a.subjectId === subjectId) || b.lastEditedAt - a.lastEditedAt,
  );
  const [choice, setChoice] = useState<string>(NEW);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!userId) return;
    setBusy(true);
    try {
      const pages = summaryToPages(content, newPageItemId);
      let notebookId: string;
      let firstPage: string;
      if (choice === NEW) {
        const created = await createNotebook(userId, { subjectId, title: content.titulo });
        notebookId = created.notebookId;
        firstPage = created.pageId;
      } else {
        notebookId = choice;
        firstPage = await addPage(userId, notebookId, "liso");
      }
      await updatePage(userId, firstPage, { elements: pages[0], background: "liso" });
      for (const elements of pages.slice(1)) {
        const id = await addPage(userId, notebookId, "liso");
        await updatePage(userId, id, { elements });
      }
      toast({
        title: "Resumo salvo no caderno",
        description: pagesLabel(pages.length),
        tone: "success",
      });
      onClose();
      if (navigator.onLine) router.push(editorHref(firstPage));
      else window.location.assign(editorHref(firstPage));
    } catch (error) {
      console.error("[lanima] salvar no caderno:", error);
      toast({ title: "Não foi possível salvar no caderno", tone: "danger" });
      setBusy(false);
    }
  };

  const row = (value: string, title: string, detail: string) => {
    const checked = choice === value;
    return (
      <button
        key={value}
        type="button"
        role="radio"
        aria-checked={checked}
        onClick={() => setChoice(value)}
        className={cn(
          "flex min-h-14 w-full items-center gap-3 rounded-md border-2 px-3 py-2 text-left",
          checked ? "border-btn bg-surface-alt" : "border-line hover:bg-surface-alt",
        )}
      >
        <NotebookPen aria-hidden size={20} strokeWidth={1.75} className="shrink-0 text-accent" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold">{title}</span>
          <span className="text-xs text-fg-2">{detail}</span>
        </span>
      </button>
    );
  };

  return (
    <Sheet
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Salvar no caderno"
      description="Os tópicos viram caixas de texto em páginas novas, para escrever por cima."
      size="m"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button icon={NotebookPen} onClick={() => void save()} disabled={busy}>
            {busy ? "Salvando…" : "Salvar no caderno"}
          </Button>
        </>
      }
    >
      <div role="radiogroup" aria-label="Caderno" className="flex flex-col gap-2">
        {row(NEW, "Novo caderno", content.titulo)}
        {options.map((n) => row(n.id, n.title, `${pagesLabel(n.pages.length)} · as páginas entram no fim`))}
      </div>
    </Sheet>
  );
}
