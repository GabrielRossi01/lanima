import type { Json } from "../../../lib/supabase/database.types";
import { adminClient, type TestAccount } from "./accounts";

/**
 * A stroke across the page, like a line of handwriting (page space: 1000 wide), saved as the app
 * saves strokes: 1 decimal, 20 points.
 */
export function lineStroke(id: string, y: number, color = "grafite") {
  const points = Array.from({ length: 20 }, (_, i) => [
    100 + i * 35,
    Math.round((y + Math.sin(i / 2) * 8) * 10) / 10,
    0.6,
  ]);
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

export interface ServerStroke {
  id: string;
  tool: string;
  color: string;
  size: number;
  points: [number, number, number][];
}

/** A page as the server has it. */
export async function serverPage(pageId: string) {
  const { data, error } = await adminClient()
    .from("notebook_pages")
    .select("strokes, elements, background, version")
    .eq("id", pageId)
    .single();
  if (error) throw error;
  return {
    ...data,
    strokes: data.strokes as unknown as ServerStroke[],
    elements: data.elements as unknown as ({ id: string; type: string; text?: string; imageId?: string } & Record<
      string,
      unknown
    >)[],
  };
}

/** The pictures of a page on the server: their rows, and whether each file is in the bucket. */
export async function serverImages(pageId: string) {
  const { data, error } = await adminClient()
    .from("notebook_images")
    .select("id, storage_path, mime_type, size_bytes, uploaded_at")
    .eq("page_id", pageId);
  if (error) throw error;
  return Promise.all(
    data.map(async (row) => {
      const file = await adminClient().storage.from("notebook").download(row.storage_path);
      return { ...row, stored: !file.error };
    }),
  );
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
