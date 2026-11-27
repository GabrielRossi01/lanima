"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { studyKey } from "@/features/study/test-queries";
import { pageSourceName } from "@/lib/notebook/format";
import { getSupabase } from "@/lib/supabase/client";
import { DataError } from "@/lib/supabase/errors";

/**
 * Notebook pages read for summaries and tests ("Usar no resumo", section 7.2): a reading of the page
 * (its text boxes and the text of its pictures), a source like a file's (section 7.5: "e,
 * opcionalmente, páginas do caderno").
 */
export interface NotebookDocument {
  /** The reading (documents row). */
  id: string;
  pageId: string;
  notebookId: string;
  /** "Aula 07 · pág. 2". */
  name: string;
  subjectId: string | null;
  ready: boolean;
  updatedAt: string;
}

export const notebookDocumentsKey = (userId: string | undefined) => studyKey(userId, "notebook-documents");

export function useNotebookDocuments() {
  const userId = useAuth().user?.id;
  return useQuery({
    queryKey: notebookDocumentsKey(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<NotebookDocument[]> => {
      const { data, error, status } = await getSupabase()
        .from("documents")
        .select(
          "id, status, updated_at, notebook_page_id, notebook_pages(position, notebook_id, notebooks(title, subject_id))",
        )
        .not("notebook_page_id", "is", null)
        .order("updated_at", { ascending: false });
      if (error) throw new DataError(error.message, { status, code: error.code });
      return (data ?? []).flatMap((d) => {
        const page = Array.isArray(d.notebook_pages) ? d.notebook_pages[0] : d.notebook_pages;
        const notebook = page && (Array.isArray(page.notebooks) ? page.notebooks[0] : page.notebooks);
        if (!page || !notebook || !d.notebook_page_id) return [];
        return [
          {
            id: d.id,
            pageId: d.notebook_page_id,
            notebookId: page.notebook_id,
            name: pageSourceName(notebook.title, page.position),
            subjectId: notebook.subject_id,
            ready: d.status === "pronto",
            updatedAt: d.updated_at,
          },
        ];
      });
    },
  });
}
