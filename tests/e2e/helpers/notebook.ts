import type { Json } from "../../../lib/supabase/database.types";
import { adminClient, type TestAccount } from "./accounts";

/** A stroke across the page, like a line of handwriting (page space: 1000 wide). */
export function lineStroke(id: string, y: number, color = "grafite") {
  const points = Array.from({ length: 30 }, (_, i) => [100 + i * 25, y + Math.sin(i / 2) * 8, 0.6]);
  return { id, tool: "caneta", color, size: 6, points };
}

/** A notebook made "on another device": straight on the server. */
export async function seedNotebook(
  account: TestAccount,
  options: {
    title: string;
    subjectId?: string | null;
    pages?: { background?: "pontilhado" | "pautado" | "liso"; strokes?: unknown[]; elements?: unknown[] }[];
    editedAt?: string;
  },
) {
  const editedAt = options.editedAt ?? new Date().toISOString();
  const { data: notebook, error } = await adminClient()
    .from("notebooks")
    .insert({ user_id: account.id, title: options.title, subject_id: options.subjectId ?? null, edited_at: editedAt })
    .select()
    .single();
  if (error) throw error;
  const pages = options.pages ?? [{}];
  const { data: rows, error: pagesError } = await adminClient()
    .from("notebook_pages")
    .insert(
      pages.map((p, i) => ({
        user_id: account.id,
        notebook_id: notebook.id,
        position: i,
        background: p.background ?? "pontilhado",
        strokes: (p.strokes ?? []) as NonNullable<Json>,
        elements: (p.elements ?? []) as NonNullable<Json>,
        edited_at: editedAt,
      })),
    )
    .select("id, position")
    .order("position");
  if (pagesError) throw pagesError;
  return { notebookId: notebook.id, pageIds: rows.map((r) => r.id) };
}

/** Her notebooks on the server, with their pages in order. */
export async function notebooksOf(account: TestAccount) {
  const { data, error } = await adminClient()
    .from("notebooks")
    .select("id, title, subject_id, notebook_pages(position, background, version)")
    .eq("user_id", account.id)
    .order("created_at");
  if (error) throw error;
  return data.map((n) => ({
    ...n,
    notebook_pages: [...n.notebook_pages].sort((a, b) => a.position - b.position),
  }));
}
