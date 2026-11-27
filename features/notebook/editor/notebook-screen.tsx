"use client";

import { ChevronLeft, FileQuestion, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-provider";
import { useSubjects } from "@/features/subjects/queries";
import { cn } from "@/lib/cn";
import { editorHref } from "@/lib/notebook/links";
import { addPage } from "@/lib/notebook/sync";
import { PageThumbnail } from "../page-thumbnail";
import { SAVE_STATE_LABELS, useNotebooks, useNotebookSaveState, usePage } from "../queries";

/**
 * The notebook's full-screen page (Caderno.html): top bar with the way back, title and "Página 2
 * de 4 · Salvo", the page in the middle and the thumbnails on the right.
 */
export function NotebookScreen() {
  const params = useSearchParams();
  const pageId = params.get("pagina");
  const router = useRouter();
  const userId = useAuth().user?.id;
  const page = usePage(pageId);
  const notebooks = useNotebooks();
  const subjects = useSubjects();
  const save = useNotebookSaveState();

  const notebook = notebooks.data?.find((n) => n.id === page.data?.notebookId);
  const loading = page.isPending || notebooks.isPending;

  if (!pageId || (!loading && (!page.data || !notebook))) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <EmptyState
          icon={FileQuestion}
          title="Página não encontrada"
          description="Ela pode ter sido excluída, ou ainda não chegou a este aparelho."
          action={<ButtonLink href="/caderno">Ver cadernos</ButtonLink>}
          className="max-w-md bg-surface"
        />
      </main>
    );
  }

  const number = notebook ? notebook.pages.findIndex((p) => p.id === pageId) + 1 : 0;
  const subject = subjects.data?.find((s) => s.id === notebook?.subjectId);

  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push(subject ? `/materias/${subject.id}` : "/caderno");
  };

  const add = async () => {
    if (!userId || !notebook) return;
    try {
      const id = await addPage(userId, notebook.id, page.data?.background);
      if (navigator.onLine) router.replace(editorHref(id));
      else window.location.replace(editorHref(id));
    } catch {
      toast({ title: "Não foi possível adicionar a página", tone: "danger" });
    }
  };

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-line bg-surface px-[max(12px,env(safe-area-inset-left))] py-2">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex min-h-11 items-center gap-1 justify-self-start rounded-full pr-3 pl-1 text-sm font-semibold text-fg"
        >
          <ChevronLeft aria-hidden size={20} strokeWidth={1.75} />
          <span className="max-w-[28vw] truncate">{subject?.name ?? "Caderno"}</span>
        </button>
        <div className="flex min-w-0 flex-col items-center text-center">
          <h1 className="m-0 max-w-[40vw] truncate text-base font-semibold">{notebook?.title ?? " "}</h1>
          <p role="status" className="m-0 text-xs text-fg-2">
            {notebook && `Página ${number} de ${notebook.pages.length} · ${SAVE_STATE_LABELS[save.state]}`}
          </p>
        </div>
        <div />
      </header>

      {/* Thumbnails on the right (Caderno.html); on narrow screens (phone, tablet upright), a strip below. */}
      <div className="flex min-h-0 flex-1 max-md:flex-col">
        <main className="touch-list min-w-0 flex-1 overflow-auto p-4 md:p-6">
          <div className="mx-auto w-fit">
            <PageThumbnail pageId={pageId} width={720} className="max-w-full" />
          </div>
        </main>

        <nav
          aria-label="Páginas"
          className={cn(
            "flex shrink-0 gap-3 p-3",
            "touch-pan-x flex-row items-start overflow-x-auto border-t border-line pb-[max(12px,env(safe-area-inset-bottom))]",
            "md:touch-list md:w-[120px] md:flex-col md:items-stretch md:overflow-x-visible md:overflow-y-auto md:border-t-0 md:border-l md:pb-3",
          )}
        >
          {notebook?.pages.map((p, i) => (
            <Link
              key={p.id}
              href={editorHref(p.id)}
              replace
              aria-current={p.id === pageId ? "page" : undefined}
              aria-label={`Página ${i + 1}`}
              className={cn(
                "flex shrink-0 flex-col items-center gap-1 rounded-md border-2 p-1.5 text-xs text-fg-2",
                p.id === pageId ? "border-brand" : "border-transparent hover:border-line",
              )}
            >
              <PageThumbnail pageId={p.id} width={80} />
              {i + 1}
            </Link>
          ))}
          <button
            type="button"
            onClick={add}
            aria-label="Adicionar página"
            className="flex min-h-14 shrink-0 items-center justify-center rounded-md border-2 border-dashed border-line-strong text-fg-2 hover:bg-surface-alt max-md:h-[124px] max-md:w-14"
          >
            <Plus aria-hidden size={20} strokeWidth={1.75} />
          </button>
        </nav>
      </div>
    </div>
  );
}
