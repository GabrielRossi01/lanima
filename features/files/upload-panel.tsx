"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Camera, CloudUpload, LoaderCircle, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type DragEvent } from "react";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SelectField } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-provider";
import { useWakeLock } from "@/features/focus/use-wake-lock";
import { useSubjects } from "@/features/subjects/queries";
import { cn } from "@/lib/cn";
import { ACCEPT, QUOTA_BYTES } from "@/lib/files/files";
import { useOnline } from "@/lib/hooks/use-online";
import { newTestHref, summarizeHref } from "@/lib/study/links";
import { useFiles, type StoredFile } from "./queries";
import { usedBytes } from "./use-file-statuses";
import { uploadFiles, useFilesWork, type UploadReport } from "./work-store";

const NO_SUBJECT = "";

function announce(
  report: UploadReport,
  subjectName: (id: string | null) => string,
  go: (href: string) => void,
  subjectId: string | null,
) {
  const { sent, refused, duplicates } = report;
  if (sent.length > 0) {
    const ids = sent.map((s) => s.id);
    // Section 7.5: right after the upload, the way to a summary or a test. Their sheets wait for the
    // text to be read.
    toast({
      title: sent.length === 1 ? "Arquivo enviado" : `${sent.length} arquivos enviados`,
      description: "Lendo o texto. Você pode continuar usando o app.",
      tone: "success",
      actions: [
        { label: "Resumir em tópicos", onClick: () => go(summarizeHref(ids)) },
        { label: "Criar teste", onClick: () => go(newTestHref({ fileIds: ids, subjectId })) },
      ],
    });
  }
  for (const { name, existing } of duplicates) {
    toast({
      title: "Você já enviou este arquivo",
      description: `${name} já está em ${subjectName(existing.subject_id)}, como “${existing.name}”.`,
      tone: "info",
    });
  }
  if (refused.length === 1) {
    toast({ title: `Não foi possível enviar ${refused[0].name}`, description: refused[0].reason, tone: "danger" });
  } else if (refused.length > 1) {
    toast({
      title: `${refused.length} arquivos não foram enviados`,
      description: refused.map((r) => `${r.name}: ${r.reason}`).join(" "),
      tone: "danger",
      duration: 10_000,
    });
  }
}

/**
 * Where files come in (section 7.9): drop area, "Escolher arquivos" and "Tirar foto". Google Drive
 * and iCloud come through the system picker. With `subjectId`, files go to that subject.
 */
export function UploadPanel({ subjectId }: { subjectId?: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const online = useOnline();
  const files = useFiles();
  const subjects = (useSubjects().data ?? []).filter((s) => !s.archived);
  const uploads = useFilesWork((s) => s.uploads);
  const reading = useFilesWork((s) => Object.keys(s.reading).length > 0);
  const [target, setTarget] = useState(NO_SUBJECT);
  const [over, setOver] = useState(false);
  const pickerId = useId();
  const cameraId = useId();
  const full = usedBytes(files.data) >= QUOTA_BYTES;
  const disabled = !online || !user || !files.data || full;
  // OCR on a long PDF takes minutes: the screen must not go dark in the middle.
  useWakeLock(uploads.length > 0 || reading);

  const subjectName = (id: string | null) => subjects.find((s) => s.id === id)?.name ?? "Arquivos";

  async function send(list: FileList | File[] | null) {
    const picked = Array.from(list ?? []);
    if (picked.length === 0 || disabled || !user) return;
    const destination = subjectId ?? (target || null);
    const report = await uploadFiles({
      files: picked,
      subjectId: destination,
      userId: user.id,
      existing: (files.data ?? []) as StoredFile[],
      queryClient,
    });
    announce(report, subjectName, (href) => router.push(href), destination);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setOver(false);
    void send(event.dataTransfer.files);
  }

  const note = !online
    ? "Sem internet. Conecte-se para enviar arquivos."
    : full
      ? "Seu espaço de 250 MB acabou. Exclua arquivos para enviar outros."
      : "PDF, Word (.docx), slides (.pptx) ou fotos · até 25 MB por arquivo";

  return (
    <Card className="gap-4">
      {subjectId === undefined && (
        <SelectField
          label="Enviar para"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="md:max-w-xs"
        >
          <option value={NO_SUBJECT}>Sem matéria</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
      )}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center gap-3 rounded-card border-2 border-dashed px-4 py-6 text-center transition-colors",
          over ? "border-brand bg-active" : "border-line-strong",
        )}
      >
        <CloudUpload aria-hidden size={28} strokeWidth={1.75} className="text-accent" />
        <p className="type-body m-0 font-semibold">
          <span className="hidden md:inline">Arraste arquivos para cá ou escolha</span>
          <span className="md:hidden">Escolha arquivos ou tire uma foto</span>
        </p>
        <p className={cn("type-caption m-0", !online || full ? "text-danger-text" : "text-fg-2")}>{note}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <label
            htmlFor={pickerId}
            aria-disabled={disabled}
            className={cn(
              buttonClasses("primary", "m"),
              "cursor-pointer",
              disabled && "pointer-events-none opacity-50",
            )}
          >
            <Upload aria-hidden size={18} strokeWidth={1.75} />
            Escolher arquivos
          </label>
          <label
            htmlFor={cameraId}
            aria-disabled={disabled}
            className={cn(
              buttonClasses("secondary", "m"),
              "cursor-pointer",
              disabled && "pointer-events-none opacity-50",
            )}
          >
            <Camera aria-hidden size={18} strokeWidth={1.75} />
            Tirar foto
          </label>
        </div>
        <input
          id={pickerId}
          type="file"
          multiple
          accept={ACCEPT}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => {
            void send(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          id={cameraId}
          type="file"
          accept="image/*"
          capture="environment"
          disabled={disabled}
          className="sr-only"
          onChange={(e) => {
            void send(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {uploads.length > 0 && (
        <ul aria-live="polite" className="m-0 flex list-none flex-col gap-1.5 p-0">
          {uploads.map((u) => (
            <li key={u.key} className="type-caption flex min-w-0 items-center gap-2 text-fg-2">
              <LoaderCircle aria-hidden size={14} className="shrink-0 animate-spin motion-reduce:animate-none" />
              <span className="truncate">Enviando {u.name}…</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
