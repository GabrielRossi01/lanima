"use client";

import { ChevronLeft, FileQuestion, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-provider";
import { useSubjects } from "@/features/subjects/queries";
import { cn } from "@/lib/cn";
import { editorHref } from "@/lib/notebook/links";
import { BACKGROUND_LABELS, PAGE_BACKGROUNDS, type PageBackground } from "@/lib/notebook/model";
import { addPage, deletePage, updatePage } from "@/lib/notebook/sync";
import { useTheme } from "@/lib/theme/use-theme";
import { PageThumbnail } from "../page-thumbnail";
import { SAVE_STATE_LABELS, useNotebooks, useNotebookSaveState, usePage } from "../queries";
import { PageEditor } from "./page-editor";
import { fingerDrawsNow, setFingerDraws, useTools } from "./tool-store";

/**
 * Another page of the same notebook: the URL changes without a request (the page is drawn from the
 * device), so it works offline and at once.
 */
function showPage(pageId: string) {
  window.history.replaceState(null, "", editorHref(pageId));
}

/**
 * The notebook's full-screen page (Caderno.html): top bar with the way back, title and "Página 2
 * de 4 · Salvo", the page to write on and the thumbnails on the right.
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
  const { resolved } = useTheme();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const index = notebook ? notebook.pages.findIndex((p) => p.id === pageId) : -1;
  const number = index + 1;
  const subject = subjects.data?.find((s) => s.id === notebook?.subjectId);

  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push(subject ? `/materias/${subject.id}` : "/caderno");
  };

  const add = async () => {
    if (!userId || !notebook) return;
    try {
      showPage(await addPage(userId, notebook.id, page.data?.background));
    } catch {
      toast({ title: "Não foi possível adicionar a página", tone: "danger" });
    }
  };

  const setBackground = (background: PageBackground) => {
    if (!userId || !pageId) return;
    void updatePage(userId, pageId, { background }, { trusted: true });
  };

  const removePage = async () => {
    setDeleting(false);
    if (!userId || !notebook || !pageId) return;
    const neighbor = notebook.pages[index + 1] ?? notebook.pages[index - 1];
    await deletePage(userId, pageId);
    if (neighbor) showPage(neighbor.id);
    toast({ title: `Página ${number} excluída` });
  };

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-line bg-surface px-[max(12px,env(safe-area-inset-left))] py-2 md:min-h-[72px] md:px-6">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex min-h-11 items-center gap-1 justify-self-start rounded-full pr-3 pl-1 text-sm font-semibold text-fg"
        >
          <ChevronLeft aria-hidden size={20} strokeWidth={1.75} className="text-accent" />
          <span className="max-w-[28vw] truncate">{subject?.name ?? "Caderno"}</span>
        </button>
        <div className="flex min-w-0 flex-col items-center text-center">
          <h1 className="m-0 max-w-[40vw] truncate text-base font-semibold">{notebook?.title ?? " "}</h1>
          <p role="status" className="m-0 text-xs text-fg-2">
            {notebook && `Página ${number} de ${notebook.pages.length} · ${SAVE_STATE_LABELS[save.state]}`}
          </p>
        </div>
        <div className="flex justify-self-end">
          <IconButton icon={MoreHorizontal} label="Mais opções" onClick={() => setOptionsOpen(true)} />
        </div>
      </header>

      {/* Thumbnails on the right (Caderno.html); on narrow screens (phone, tablet upright), a strip below. */}
      <div className="flex min-h-0 flex-1 max-md:flex-col">
        {page.data && userId && resolved ? (
          <PageEditor
            key={page.data.id}
            page={page.data}
            userId={userId}
            theme={resolved}
            pageNumber={number}
            onAddPage={add}
          />
        ) : (
          <div className="flex-1" />
        )}

        <nav
          aria-label="Páginas"
          className={cn(
            "flex shrink-0 gap-3 bg-bg p-3",
            "touch-pan-x flex-row items-start overflow-x-auto border-t border-line pb-[max(12px,env(safe-area-inset-bottom))]",
            "md:touch-list md:w-[120px] md:flex-col md:items-stretch md:overflow-x-visible md:overflow-y-auto md:border-t-0 md:border-l md:pb-3",
          )}
        >
          {notebook?.pages.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => showPage(p.id)}
              aria-current={p.id === pageId ? "page" : undefined}
              aria-label={`Página ${i + 1}`}
              className={cn(
                "flex shrink-0 flex-col items-center gap-1 rounded-md border-2 p-1.5 text-xs font-semibold text-fg-2",
                p.id === pageId ? "border-brand" : "border-transparent hover:border-line",
              )}
            >
              <PageThumbnail pageId={p.id} width={80} />
              {i + 1}
            </button>
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

      <Sheet open={optionsOpen} onClose={() => setOptionsOpen(false)} title="Mais opções" size="s">
        <EditorOptions
          background={page.data?.background ?? "pontilhado"}
          onBackground={setBackground}
          canDelete={(notebook?.pages.length ?? 0) > 1}
          onDelete={() => {
            setOptionsOpen(false);
            setDeleting(true);
          }}
        />
      </Sheet>
      <ConfirmDialog
        open={deleting}
        title={`Excluir a página ${number}?`}
        description="Tudo o que está nela será apagado, também nos seus outros aparelhos."
        confirmLabel="Excluir"
        danger
        onClose={() => setDeleting(false)}
        onConfirm={() => void removePage()}
      />
    </div>
  );
}

function EditorOptions({
  background,
  onBackground,
  canDelete,
  onDelete,
}: {
  background: PageBackground;
  onBackground: (background: PageBackground) => void;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const chosen = useTools((s) => s.fingerDraws);
  const fingerDraws = chosen ?? fingerDrawsNow();
  return (
    <div className="flex flex-col gap-5 pb-2">
      <Switch
        checked={fingerDraws}
        onChange={setFingerDraws}
        label="Desenhar com o dedo"
        description={
          fingerDraws
            ? "Um dedo escreve; dois dedos rolam e dão zoom."
            : "Com a caneta, um dedo rola a página e dois dão zoom."
        }
      />
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-fg">Fundo desta página</span>
        <SegmentedControl
          label="Fundo desta página"
          options={PAGE_BACKGROUNDS.map((value) => ({ value, label: BACKGROUND_LABELS[value] }))}
          value={background}
          onChange={onBackground}
        />
      </div>
      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-danger-text hover:bg-surface-alt"
        >
          <Trash2 aria-hidden size={20} strokeWidth={1.75} className="shrink-0" />
          Excluir esta página
        </button>
      )}
    </div>
  );
}
