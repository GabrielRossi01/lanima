"use client";

import { useNow } from "@/lib/hooks/use-now";
import { fileStatus, type FileStatus } from "@/lib/files/status";
import type { StoredFile } from "./queries";
import { useFilesWork } from "./work-store";

/** The badge of each file: its saved state plus what this tab is doing with it. */
export function useFileStatuses(files: readonly StoredFile[]): Map<string, FileStatus> {
  const reading = useFilesWork((s) => s.reading);
  const failures = useFilesWork((s) => s.failures);
  const now = useNow()?.getTime() ?? 0;
  return new Map(
    files.map((f) => [
      f.id,
      fileStatus({
        uploadedAt: f.uploaded_at,
        createdAt: f.created_at,
        document: f.document,
        local: f.id in reading ? reading[f.id] : undefined,
        failure: failures[f.id],
        now,
      }),
    ]),
  );
}

/** Bytes she is using, of the 250 MB. */
export function usedBytes(files: readonly StoredFile[] | undefined): number {
  return (files ?? []).reduce((sum, f) => sum + f.size_bytes, 0);
}
