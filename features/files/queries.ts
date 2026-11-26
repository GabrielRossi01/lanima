"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import type { Chunk } from "@/lib/extract/text";
import type { FileKind } from "@/lib/files/files";
import { getSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { DataError } from "@/lib/supabase/errors";

type Tables = Database["public"]["Tables"];
export type FileRow = Tables["files"]["Row"];
export type DocumentRow = Pick<
  Tables["documents"]["Row"],
  "id" | "status" | "page_count" | "pages_approx" | "used_ocr" | "excluded_pages" | "updated_at"
>;
export type DocumentStatus = "extraindo" | "pronto" | "sem_texto" | "erro";
export interface StoredFile extends Omit<FileRow, "kind"> {
  kind: FileKind;
  document: (DocumentRow & { status: DocumentStatus }) | null;
}

export const filesKey = (userId: string | undefined) => ["files", userId] as const;
export const chunksKey = (documentId: string) => ["chunks", documentId] as const;

export const BUCKET = "files";

function check<T>(result: {
  data: T | null;
  error: { message: string; code?: string } | null;
  status: number;
}): NonNullable<T> {
  if (result.error) throw new DataError(result.error.message, { status: result.status, code: result.error.code });
  return result.data as NonNullable<T>;
}

function useUserId() {
  return useAuth().user?.id;
}

const DOCUMENT_COLUMNS = "id, status, page_count, pages_approx, used_ocr, excluded_pages, updated_at";

/** One file per row, with its reading. PostgREST sends the reading as a list of one. */
function toStoredFile(row: FileRow & { documents: DocumentRow[] | DocumentRow | null }): StoredFile {
  const { documents, ...file } = row;
  const document = Array.isArray(documents) ? (documents[0] ?? null) : documents;
  return { ...file, kind: file.kind as FileKind, document: document as StoredFile["document"] };
}

export async function fetchFiles(): Promise<StoredFile[]> {
  const rows = check(
    await getSupabase()
      .from("files")
      .select(`*, documents(${DOCUMENT_COLUMNS})`)
      .order("created_at", { ascending: false }),
  );
  return rows.map(toStoredFile);
}

/**
 * Her files, newest first; kept on the device so the list opens offline (section 6). While a
 * reading is going on in another device, it checks again every 15 s.
 */
export function useFiles() {
  const userId = useUserId();
  return useQuery({
    queryKey: filesKey(userId),
    enabled: Boolean(userId),
    queryFn: fetchFiles,
    refetchInterval: (query) => (query.state.data?.some((f) => f.document?.status === "extraindo") ? 15_000 : false),
  });
}

/** The text of one reading, page by page. Not kept on the device: it can be long. */
export function useChunks(documentId: string | null) {
  return useQuery({
    queryKey: chunksKey(documentId ?? ""),
    enabled: Boolean(documentId),
    queryFn: async (): Promise<Chunk[]> =>
      check(
        await getSupabase()
          .from("document_chunks")
          .select("position, page, text")
          .eq("document_id", documentId!)
          .order("position"),
      ),
  });
}

/** Signed link to open or download a file (10 min). */
export async function fileLink(file: Pick<StoredFile, "storage_path" | "name">, download: boolean): Promise<string> {
  const { data, error } = await getSupabase()
    .storage.from(BUCKET)
    .createSignedUrl(file.storage_path, 600, download ? { download: file.name } : undefined);
  if (error || !data) throw error ?? new Error("Sem link para o arquivo.");
  return data.signedUrl;
}

export async function downloadFile(path: string): Promise<Blob> {
  const { data, error } = await getSupabase().storage.from(BUCKET).download(path);
  if (error || !data) throw error ?? new Error("Não foi possível baixar o arquivo.");
  return data;
}

function useFilesMutation<T>(
  mutationFn: (vars: T) => Promise<unknown>,
  apply?: (list: StoredFile[], vars: T) => StoredFile[],
) {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const key = filesKey(userId);
  return useMutation({
    mutationFn,
    onMutate: async (vars: T) => {
      if (!apply) return { previous: undefined };
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<StoredFile[]>(key);
      if (previous) queryClient.setQueryData<StoredFile[]>(key, apply(previous, vars));
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useRenameFile() {
  return useFilesMutation(
    async ({ id, name }: { id: string; name: string }) =>
      check(await getSupabase().from("files").update({ name }).eq("id", id).select("id")),
    (list, { id, name }) => list.map((f) => (f.id === id ? { ...f, name } : f)),
  );
}

export function useMoveFiles() {
  return useFilesMutation(
    async ({ ids, subjectId }: { ids: string[]; subjectId: string | null }) =>
      check(await getSupabase().from("files").update({ subject_id: subjectId }).in("id", ids).select("id")),
    (list, { ids, subjectId }) => list.map((f) => (ids.includes(f.id) ? { ...f, subject_id: subjectId } : f)),
  );
}

/** The stored file first, then the row (its reading goes with it). */
export async function deleteFiles(files: readonly Pick<StoredFile, "id" | "storage_path">[]): Promise<void> {
  if (files.length === 0) return;
  const supabase = getSupabase();
  const { error } = await supabase.storage.from(BUCKET).remove(files.map((f) => f.storage_path));
  if (error) throw error;
  check(
    await supabase
      .from("files")
      .delete()
      .in(
        "id",
        files.map((f) => f.id),
      )
      .select("id"),
  );
}

export function useDeleteFiles() {
  return useFilesMutation(
    (files: StoredFile[]) => deleteFiles(files),
    (list, files) => list.filter((f) => !files.some((g) => g.id === f.id)),
  );
}

export function useExcludePages() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ documentId, pages }: { documentId: string; pages: number[] }) =>
      check(await getSupabase().from("documents").update({ excluded_pages: pages }).eq("id", documentId).select("id")),
    onMutate: async ({ documentId, pages }) => {
      const key = filesKey(userId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<StoredFile[]>(key);
      if (previous) {
        queryClient.setQueryData<StoredFile[]>(
          key,
          previous.map((f) =>
            f.document?.id === documentId ? { ...f, document: { ...f.document, excluded_pages: pages } } : f,
          ),
        );
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(filesKey(userId), context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: filesKey(userId) }),
  });
}

/** Saves a reading in one go (old chunks out, new ones in). */
export async function saveReading(input: {
  documentId: string;
  contentHash: string;
  pageCount: number;
  pagesApprox: boolean;
  usedOcr: boolean;
  chunks: Chunk[];
}): Promise<void> {
  check(
    await getSupabase().rpc("save_extraction", {
      p_document: input.documentId,
      p_content_hash: input.contentHash,
      p_page_count: input.pageCount,
      p_pages_approx: input.pagesApprox,
      p_used_ocr: input.usedOcr,
      p_chunks: input.chunks.map((c) => ({ position: c.position, page: c.page, text: c.text })),
    }),
  );
}

export async function setReadingStatus(documentId: string, status: "extraindo" | "erro"): Promise<void> {
  check(await getSupabase().from("documents").update({ status }).eq("id", documentId).select("id"));
}
