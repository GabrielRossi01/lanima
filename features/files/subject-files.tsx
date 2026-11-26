"use client";

import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IconTile } from "@/components/ui/icon-tile";
import type { Subject } from "@/lib/subjects/subjects";
import { FileList } from "./file-list";
import { useFiles } from "./queries";
import { KIND_ICONS, StatusBadge } from "./status-badge";
import { UploadPanel } from "./upload-panel";
import { useFileStatuses } from "./use-file-statuses";

/** Aba Arquivos da matéria: what is sent here goes to this subject. */
export function SubjectFilesTab({ subject, subjects }: { subject: Subject; subjects: Subject[] }) {
  const files = useFiles();
  const own = (files.data ?? []).filter((f) => f.subject_id === subject.id);
  const statuses = useFileStatuses(own);
  return (
    <div className="flex flex-col gap-5">
      <UploadPanel subjectId={subject.id} />
      {!files.data ? (
        <div aria-busy className="h-16 animate-pulse rounded-card bg-surface-alt motion-reduce:animate-none" />
      ) : own.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum arquivo nesta matéria"
          description="Envie os slides, apostilas e fotos de lâminas desta matéria."
        />
      ) : (
        <FileList files={own} statuses={statuses} subjects={subjects} showSubject={false} />
      )}
    </div>
  );
}

/** "Arquivos recentes" on the subject's overview: the last three. */
export function RecentFiles({ subjectId, onSeeAll }: { subjectId: string; onSeeAll: () => void }) {
  const files = useFiles();
  const own = (files.data ?? []).filter((f) => f.subject_id === subjectId);
  const recent = own.slice(0, 3);
  const statuses = useFileStatuses(recent);
  return (
    <>
      <CardHeader
        title="Arquivos recentes"
        action={
          <Button variant="ghost" size="s" onClick={onSeeAll}>
            {own.length > 0 ? "Ver todos" : "Enviar"}
          </Button>
        }
      />
      {recent.length === 0 ? (
        <p className="type-body m-0 text-fg-2">{files.data ? "Nenhum arquivo nesta matéria ainda." : " "}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {recent.map((f) => (
            <li key={f.id} className="flex min-w-0 items-center gap-3">
              <IconTile icon={KIND_ICONS[f.kind]} size={36} />
              <div className="flex min-w-0 flex-col items-start gap-1">
                <span className="max-w-full truncate text-sm font-semibold">{f.name}</span>
                <StatusBadge status={statuses.get(f.id) ?? { kind: "interrompida" }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
