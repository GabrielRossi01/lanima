"use client";

import { CloudOff, Download, MoreHorizontal, PenLine, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-provider";
import { cn } from "@/lib/cn";
import { editedWhen, pagesLabel } from "@/lib/notebook/format";
import { editorHref } from "@/lib/notebook/links";
import { deleteNotebook } from "@/lib/notebook/sync";
import { downloadNotebookPdf, makeNotebookPdf } from "./export-notebook";
import { NotebookFormSheet } from "./notebook-form-sheet";
import { PageThumbnail } from "./page-thumbnail";
import type { NotebookWithPages } from "./queries";

/** The page she changed last, and where it is in its notebook. */
export function lastPage(notebook: NotebookWithPages) {
  const page = [...notebook.pages].sort((a, b) => b.editedAt - a.editedAt)[0];
  return page ? { page, number: notebook.pages.indexOf(page) + 1 } : null;
}

function NotebookCard({
  notebook,
  now,
  onOptions,
}: {
  notebook: NotebookWithPages;
  now: number;
  onOptions: () => void;
}) {
  const first = notebook.pages[0];
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-surface">
      <Link
        href={first ? editorHref(first.id) : "/caderno"}
        aria-label={`Abrir ${notebook.title}`}
        className="flex h-[150px] justify-center overflow-hidden bg-surface-alt pt-3.5"
      >
        <PageThumbnail pageId={first?.id} width={150} />
      </Link>
      <div className="flex items-start gap-0.5 py-2.5 pr-1 pl-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="m-0 text-[15px] leading-5 font-semibold wrap-break-word">{notebook.title}</h3>
          <span className="text-[12.5px] text-fg-2">
            {pagesLabel(notebook.pages.length)} · {editedWhen(notebook.lastEditedAt, now)}
          </span>
          {notebook.unsent && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning-text">
              <CloudOff aria-hidden size={14} strokeWidth={2} className="shrink-0" />
              Offline · será sincronizado
            </span>
          )}
        </div>
        <IconButton icon={MoreHorizontal} label={`Opções de ${notebook.title}`} variant="ghost" onClick={onOptions} />
      </div>
    </article>
  );
}

/** Cards of notebooks, with the "⋯" menu (rename, change subject, delete). */
export function NotebookGrid({
  notebooks,
  now,
  className,
}: {
  notebooks: NotebookWithPages[];
  now: number;
  className?: string;
}) {
  const userId = useAuth().user?.id;
  const [menuFor, setMenuFor] = useState<NotebookWithPages | null>(null);
  const [editing, setEditing] = useState<NotebookWithPages | null>(null);
  const [deleting, setDeleting] = useState<NotebookWithPages | null>(null);

  return (
    <>
      <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4", className)}>
        {notebooks.map((notebook) => (
          <NotebookCard key={notebook.id} notebook={notebook} now={now} onOptions={() => setMenuFor(notebook)} />
        ))}
      </div>

      <Sheet open={menuFor !== null} onClose={() => setMenuFor(null)} title={menuFor?.title ?? "Caderno"} size="s">
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {[
            {
              icon: Pencil,
              label: "Renomear ou mudar de matéria",
              onClick: () => {
                setEditing(menuFor);
                setMenuFor(null);
              },
            },
            {
              icon: Download,
              label: "Exportar em PDF",
              onClick: () => {
                const target = menuFor;
                setMenuFor(null);
                if (!target || !userId) return;
                makeNotebookPdf(userId, { title: target.title, pageIds: target.pages.map((p) => p.id) }).then(
                  (pdf) => {
                    downloadNotebookPdf(pdf);
                    toast({ title: "PDF pronto", description: pdf.fileName, tone: "success" });
                  },
                  () => toast({ title: "Não foi possível fazer o PDF", tone: "danger" }),
                );
              },
            },
            {
              icon: Trash2,
              label: "Excluir caderno",
              onClick: () => {
                setDeleting(menuFor);
                setMenuFor(null);
              },
            },
          ].map(({ icon: Icon, label, onClick }) => (
            <li key={label}>
              <button
                type="button"
                onClick={onClick}
                className="flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-fg hover:bg-surface-alt"
              >
                <Icon aria-hidden size={20} strokeWidth={1.75} className="shrink-0 text-accent" />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <NotebookFormSheet open={editing !== null} onClose={() => setEditing(null)} notebook={editing} />
      <ConfirmDialog
        open={deleting !== null}
        title="Excluir caderno?"
        description={
          deleting && (
            <>
              <strong className="text-fg">{deleting.title}</strong> e {pagesLabel(deleting.pages.length)} serão
              excluídos, também nos seus outros aparelhos.
            </>
          )
        }
        confirmLabel="Excluir"
        danger
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (!target || !userId) return;
          deleteNotebook(userId, target.id).then(
            () => toast({ title: "Caderno excluído", description: target.title }),
            () => toast({ title: "Não foi possível excluir", tone: "danger" }),
          );
        }}
      />
    </>
  );
}

/** "Continuar de onde parou": the page she changed last, one tap away. */
export function ContinueCard({
  notebook,
  subjectName,
  now,
}: {
  notebook: NotebookWithPages;
  subjectName: string | null;
  now: number;
}) {
  const last = lastPage(notebook);
  if (!last) return null;
  const total = notebook.pages.length;
  return (
    <section
      aria-labelledby="continuar-caderno"
      className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3.5 shadow-card md:flex-row md:items-center md:gap-5 md:p-4"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3.5 md:gap-5">
        <div className="flex h-24 w-[88px] shrink-0 justify-center overflow-hidden rounded-md bg-surface-alt pt-2.5 md:h-[124px] md:w-[168px] md:pt-3">
          <PageThumbnail pageId={last.page.id} width={112} className="max-md:w-[68px]! max-md:h-[96px]!" />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span id="continuar-caderno" className="text-[11px] font-semibold tracking-[1px] text-fg-2 uppercase">
            Continuar de onde parou
          </span>
          <span className="font-serif text-lg leading-6 font-semibold wrap-break-word md:text-[22px] md:leading-7">
            {notebook.title}
          </span>
          <span className="text-[13px] text-fg-2 md:text-sm">
            {[subjectName, `página ${last.number} de ${total}`, `editado ${editedWhen(last.page.editedAt, now)}`]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
      </div>
      <ButtonLink href={editorHref(last.page.id)} icon={PenLine}>
        Abrir página {last.number}
      </ButtonLink>
    </section>
  );
}
