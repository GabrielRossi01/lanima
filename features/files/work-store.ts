"use client";

import type { QueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { chunkPages, hashInput } from "@/lib/extract/text";
import {
  checkFile,
  cleanName,
  MIME,
  photoName,
  QUOTA_ERROR,
  sha256,
  storagePath,
  type FileKind,
} from "@/lib/files/files";
import { getSupabase } from "@/lib/supabase/client";
import { DataError, friendlyError } from "@/lib/supabase/errors";
import { BUCKET, downloadFile, filesKey, saveReading, setReadingStatus, type StoredFile } from "./queries";
import { compressPhoto, ReadError, readFile, type ReaderProgress } from "./reader";

/**
 * Uploads and readings going on in this tab. Module state (not a component's), so they go on when
 * she changes screens; one reading at a time, because OCR is heavy on a tablet.
 */
interface Upload {
  key: string;
  name: string;
}

interface Job {
  fileId: string;
  documentId: string;
  kind: FileKind;
  source: Blob;
  userId: string;
  queryClient: QueryClient;
}

interface WorkState {
  uploads: Upload[];
  /** File id → what is being read now, or null while waiting its turn. */
  reading: Record<string, ReaderProgress | null>;
  /** File id → why the last reading on this device failed. */
  failures: Record<string, string>;
}

export const useFilesWork = create<WorkState>()(() => ({ uploads: [], reading: {}, failures: {} }));

const queue: Job[] = [];
let running = false;

function setReading(fileId: string, progress: ReaderProgress | null | undefined) {
  useFilesWork.setState((s) => {
    const reading = { ...s.reading };
    if (progress === undefined) delete reading[fileId];
    else reading[fileId] = progress;
    return { reading };
  });
}

function setFailure(fileId: string, message: string | undefined) {
  useFilesWork.setState((s) => {
    const failures = { ...s.failures };
    if (message === undefined) delete failures[fileId];
    else failures[fileId] = message;
    return { failures };
  });
}

function enqueue(job: Job) {
  setFailure(job.fileId, undefined);
  setReading(job.fileId, null);
  queue.push(job);
  void run();
}

async function run() {
  if (running) return;
  running = true;
  try {
    for (let job = queue.shift(); job; job = queue.shift()) await read(job);
  } finally {
    running = false;
  }
}

async function read(job: Job) {
  const { fileId, documentId, kind, source, userId, queryClient } = job;
  try {
    const reading = await readFile(source, kind, (progress) => setReading(fileId, progress));
    setReading(fileId, { label: "Salvando o texto…" });
    const chunks = chunkPages(reading.pages);
    await saveReading({
      documentId,
      contentHash: await sha256(hashInput(chunks)),
      pageCount: reading.pageCount,
      pagesApprox: reading.pagesApprox,
      usedOcr: reading.usedOcr,
      chunks,
    });
  } catch (error) {
    console.error("[lanima] leitura do arquivo:", error);
    setFailure(
      fileId,
      error instanceof ReadError ? error.message : friendlyError(error, "Não foi possível ler o arquivo."),
    );
    await setReadingStatus(documentId, "erro").catch(() => {});
  } finally {
    setReading(fileId, undefined);
    await queryClient.invalidateQueries({ queryKey: filesKey(userId) });
  }
}

/** Reads a stored file again (the reading failed or was interrupted). */
export async function readAgain(file: StoredFile, userId: string, queryClient: QueryClient): Promise<void> {
  if (!file.document || file.id in useFilesWork.getState().reading) return;
  setReading(file.id, { label: "Baixando o arquivo…" });
  try {
    await setReadingStatus(file.document.id, "extraindo");
    const source = await downloadFile(file.storage_path);
    enqueue({ fileId: file.id, documentId: file.document.id, kind: file.kind, source, userId, queryClient });
  } catch (error) {
    setReading(file.id, undefined);
    setFailure(file.id, friendlyError(error, "Não foi possível baixar o arquivo."));
  }
}

export interface UploadReport {
  sent: string[];
  refused: { name: string; reason: string }[];
  duplicates: { name: string; existing: StoredFile }[];
  quotaFull: boolean;
}

function canonicalMime(kind: Exclude<FileKind, "foto">): string {
  return kind === "pdf" ? MIME.pdf : kind === "documento" ? MIME.docx : MIME.pptx;
}

/**
 * Sends the files she picked, one by one: checked, compressed if a photo, registered (the quota is
 * checked there), stored, and then read in the background.
 */
export async function uploadFiles(input: {
  files: File[];
  subjectId: string | null;
  userId: string;
  existing: readonly StoredFile[];
  queryClient: QueryClient;
}): Promise<UploadReport> {
  const { files, subjectId, userId, existing, queryClient } = input;
  const report: UploadReport = { sent: [], refused: [], duplicates: [], quotaFull: false };
  const supabase = getSupabase();
  const known = new Map(existing.map((f) => [f.sha256, f]));

  for (const [i, file] of files.entries()) {
    const key = `${Date.now()}-${i}`;
    const accepted = checkFile(file);
    if (!accepted.ok) {
      report.refused.push({ name: file.name, reason: accepted.reason });
      continue;
    }
    if (report.quotaFull) {
      report.refused.push({ name: file.name, reason: "Seu espaço de 250 MB acabou." });
      continue;
    }
    useFilesWork.setState((s) => ({ uploads: [...s.uploads, { key, name: file.name }] }));
    let fileId: string | null = null;
    let storedPath: string | null = null;
    try {
      const hash = await sha256(await file.arrayBuffer());
      const duplicate = known.get(hash);
      if (duplicate) {
        report.duplicates.push({ name: file.name, existing: duplicate });
        continue;
      }
      const kind = accepted.kind;
      let blob: Blob = file;
      let name = cleanName(file.name) || "Arquivo";
      let mime: string;
      if (kind === "foto") {
        const photo = await compressPhoto(file);
        blob = photo.blob;
        name = cleanName(photoName(file.name, new Date(), photo.extension));
        mime = blob.type;
      } else {
        mime = canonicalMime(kind);
      }

      const id = crypto.randomUUID();
      const documentId = crypto.randomUUID();
      const path = storagePath(userId, id);
      const inserted = await supabase.from("files").insert({
        id,
        subject_id: subjectId,
        name,
        kind,
        mime_type: mime,
        size_bytes: blob.size,
        storage_path: path,
        sha256: hash,
      });
      if (inserted.error) {
        if (inserted.error.code === QUOTA_ERROR) {
          report.quotaFull = true;
          report.refused.push({ name: file.name, reason: "Seu espaço de 250 MB acabou." });
          continue;
        }
        if (inserted.error.code === "23505") {
          report.refused.push({ name: file.name, reason: "Este arquivo já foi enviado." });
          continue;
        }
        throw new DataError(inserted.error.message, { status: inserted.status, code: inserted.error.code });
      }
      fileId = id;
      const document = await supabase.from("documents").insert({ id: documentId, file_id: id });
      if (document.error)
        throw new DataError(document.error.message, { status: document.status, code: document.error.code });
      const stored = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: mime, upsert: false });
      if (stored.error) throw stored.error;
      storedPath = path;
      const done = await supabase.from("files").update({ uploaded_at: new Date().toISOString() }).eq("id", id);
      if (done.error) throw new DataError(done.error.message, { status: done.status, code: done.error.code });

      known.set(hash, { id, name } as StoredFile);
      report.sent.push(name);
      await queryClient.invalidateQueries({ queryKey: filesKey(userId) });
      // Photos are read from the original: more detail for the OCR than the stored copy.
      enqueue({ fileId: id, documentId, kind, source: file, userId, queryClient });
    } catch (error) {
      console.error("[lanima] envio do arquivo:", error);
      report.refused.push({
        name: file.name,
        reason: error instanceof ReadError ? error.message : friendlyError(error, "Não foi possível enviar."),
      });
      // Nothing half-done is left: the row goes (and the reading with it).
      if (storedPath) await supabase.storage.from(BUCKET).remove([storedPath]);
      if (fileId) await supabase.from("files").delete().eq("id", fileId);
    } finally {
      useFilesWork.setState((s) => ({ uploads: s.uploads.filter((u) => u.key !== key) }));
    }
  }
  if (report.refused.length > 0 || report.duplicates.length > 0) {
    await queryClient.invalidateQueries({ queryKey: filesKey(userId) });
  }
  return report;
}
