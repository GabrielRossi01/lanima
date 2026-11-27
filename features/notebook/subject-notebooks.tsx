"use client";

import { NotebookPen, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useNow } from "@/lib/hooks/use-now";
import { editedWhen } from "@/lib/notebook/format";
import { editorHref } from "@/lib/notebook/links";
import { lastPage, NotebookGrid } from "./notebook-cards";
import { NotebookFormSheet } from "./notebook-form-sheet";
import { PageThumbnail } from "./page-thumbnail";
import { useNotebookList, useNotebooks } from "./queries";

/** The Matéria's "Anotações" tab: its notebooks, like in Caderno. */
export function SubjectNotebooksTab({ subjectId, subjectName }: { subjectId: string; subjectName: string }) {
  const notebooks = useNotebookList();
  const now = useNow();
  const [creating, setCreating] = useState(false);
  const own = (notebooks ?? []).filter((n) => n.subjectId === subjectId);

  if (!notebooks || !now) {
    return <div aria-busy className="h-64 animate-pulse rounded-card bg-surface-alt motion-reduce:animate-none" />;
  }
  return (
    <>
      {own.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title={`Nenhum caderno de ${subjectName}`}
          description="Escreva à mão as aulas desta matéria. Funciona sem internet."
          action={
            <Button icon={Plus} onClick={() => setCreating(true)}>
              Novo caderno
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <Button icon={Plus} variant="secondary" onClick={() => setCreating(true)}>
              Novo caderno
            </Button>
          </div>
          <NotebookGrid notebooks={own} now={now.getTime()} />
        </div>
      )}
      <NotebookFormSheet open={creating} onClose={() => setCreating(false)} subjectId={subjectId} />
    </>
  );
}

/** "Anotações recentes" on the Matéria's overview: the last pages she wrote here. */
export function RecentNotes({ subjectId, onSeeAll }: { subjectId: string; onSeeAll: () => void }) {
  const notebooks = useNotebooks();
  const now = useNow();
  const own = (notebooks.data ?? []).filter((n) => n.subjectId === subjectId).slice(0, 3);

  return (
    <>
      <CardHeader
        title="Anotações recentes"
        action={
          own.length > 0 ? (
            <Button variant="ghost" size="s" onClick={onSeeAll}>
              Ver todas
            </Button>
          ) : undefined
        }
      />
      {own.length === 0 || !now ? (
        <p className="type-body m-0 text-fg-2">Os cadernos desta matéria aparecem aqui.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {own.map((notebook) => {
            const last = lastPage(notebook);
            if (!last) return null;
            return (
              <li key={notebook.id} className="border-t border-subtle first:border-t-0">
                <Link href={editorHref(last.page.id)} className="flex min-h-16 items-center gap-3.5 py-2.5 text-fg">
                  <span className="flex h-14 w-12 shrink-0 justify-center overflow-hidden rounded-sm bg-surface-alt pt-1.5">
                    <PageThumbnail pageId={last.page.id} width={38} />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[15px] font-semibold wrap-break-word">{notebook.title}</span>
                    <span className="text-[13px] text-fg-2">
                      página {last.number} de {notebook.pages.length} · {editedWhen(last.page.editedAt, now.getTime())}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
