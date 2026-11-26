"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  ExternalLink,
  FolderInput,
  ListChecks,
  Pencil,
  RotateCcw,
  ScrollText,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-provider";
import { cn } from "@/lib/cn";
import { formatBytes, KIND_LABELS, renamed } from "@/lib/files/files";
import { canReadAgain, hasPreview, type FileStatus } from "@/lib/files/status";
import { useOnline } from "@/lib/hooks/use-online";
import type { Subject } from "@/lib/subjects/subjects";
import { newTestHref, summarizeHref } from "@/lib/study/links";
import { friendlyError } from "@/lib/supabase/errors";
import { fileLink, useDeleteFiles, useMoveFiles, useRenameFile, type StoredFile } from "./queries";
import { TextPreviewSheet } from "./text-preview";
import { readAgain } from "./work-store";

export type FileDialog =
  | { mode: "actions" | "preview" | "rename"; files: [StoredFile] }
  | { mode: "move" | "delete"; files: StoredFile[] }
  | null;

const row =
  "flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-semibold text-fg no-underline hover:bg-surface-alt disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

function ActionRow({
  icon: Icon,
  children,
  danger,
  ...props
}: { icon: LucideIcon; children: ReactNode; danger?: boolean } & (
  | ({ href: string; download?: boolean } & { onClick?: never })
  | { onClick: () => void; href?: never; disabled?: boolean }
)) {
  const content = (
    <>
      <Icon aria-hidden size={20} strokeWidth={1.75} className={danger ? "text-danger-text" : "text-accent"} />
      <span className={danger ? "text-danger-text" : undefined}>{children}</span>
    </>
  );
  if ("href" in props && props.href !== undefined) {
    return (
      <a href={props.href} target="_blank" rel="noopener noreferrer" className={row}>
        {content}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={row}
      onClick={props.onClick}
      disabled={"disabled" in props ? props.disabled : false}
    >
      {content}
    </button>
  );
}

/** Links to open and download, signed for 10 minutes; asked for when the menu opens. */
function useLinks(file: StoredFile | null, enabled: boolean) {
  return useQuery({
    queryKey: ["file-links", file?.id],
    enabled: Boolean(file) && enabled,
    staleTime: 5 * 60_000,
    gcTime: 5 * 60_000,
    queryFn: async () => ({ open: await fileLink(file!, false), download: await fileLink(file!, true) }),
  });
}

function ActionsSheet({
  file,
  status,
  subject,
  onClose,
  onChoose,
}: {
  file: StoredFile;
  status: FileStatus;
  subject: Subject | undefined;
  onClose: () => void;
  onChoose: (dialog: FileDialog) => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const online = useOnline();
  const stored = file.uploaded_at !== null;
  const links = useLinks(file, online && stored);
  const waiting = !links.data;
  const router = useRouter();
  const ready = file.document?.status === "pronto";
  return (
    <Sheet
      open
      onClose={onClose}
      title={file.name}
      description={`${KIND_LABELS[file.kind]} · ${formatBytes(file.size_bytes)} · ${subject?.name ?? "Sem matéria"}`}
      size="s"
    >
      <div className="flex flex-col gap-1" role="group" aria-label={`Ações: ${file.name}`}>
        {links.data ? (
          <>
            <ActionRow icon={ExternalLink} href={links.data.open}>
              Abrir
            </ActionRow>
            <ActionRow icon={Download} href={links.data.download}>
              Baixar
            </ActionRow>
          </>
        ) : (
          <>
            <ActionRow icon={ExternalLink} onClick={() => {}} disabled>
              {!online
                ? "Abrir (sem internet)"
                : !stored
                  ? "Abrir (envio incompleto)"
                  : waiting && !links.error
                    ? "Abrir…"
                    : "Abrir"}
            </ActionRow>
            <ActionRow icon={Download} onClick={() => {}} disabled>
              Baixar
            </ActionRow>
          </>
        )}
        {hasPreview(status) && (
          <ActionRow icon={ScrollText} onClick={() => onChoose({ mode: "preview", files: [file] })}>
            Ver texto
          </ActionRow>
        )}
        {/* Section 7.5: from a file to a summary or a test, once its text is read. */}
        <ActionRow
          icon={Sparkles}
          disabled={!online || !ready}
          onClick={() => {
            onClose();
            router.push(summarizeHref([file.id]));
          }}
        >
          {ready ? "Resumir em tópicos" : "Resumir em tópicos (texto ainda não lido)"}
        </ActionRow>
        <ActionRow
          icon={ListChecks}
          disabled={!online || !ready}
          onClick={() => {
            onClose();
            router.push(newTestHref({ fileIds: [file.id], subjectId: file.subject_id }));
          }}
        >
          Criar teste
        </ActionRow>
        {canReadAgain(status) && stored && (
          <ActionRow
            icon={RotateCcw}
            disabled={!online}
            onClick={() => {
              if (user) void readAgain(file, user.id, queryClient);
              onClose();
            }}
          >
            Ler de novo
          </ActionRow>
        )}
        <ActionRow icon={Pencil} disabled={!online} onClick={() => onChoose({ mode: "rename", files: [file] })}>
          Renomear
        </ActionRow>
        <ActionRow icon={FolderInput} disabled={!online} onClick={() => onChoose({ mode: "move", files: [file] })}>
          Mudar de matéria
        </ActionRow>
        <ActionRow icon={Trash2} danger disabled={!online} onClick={() => onChoose({ mode: "delete", files: [file] })}>
          Excluir
        </ActionRow>
      </div>
    </Sheet>
  );
}

function RenameSheet({ file, onClose }: { file: StoredFile; onClose: () => void }) {
  const formId = useId();
  const rename = useRenameFile();
  const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  const [name, setName] = useState(extension ? file.name.slice(0, -extension.length) : file.name);
  return (
    <Sheet
      open
      onClose={onClose}
      title="Renomear arquivo"
      size="s"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={rename.isPending || !name.trim()}>
            Salvar
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          rename.mutate(
            { id: file.id, name: renamed(file.name, name) },
            {
              onSuccess: onClose,
              onError: (error) =>
                toast({ title: "Não foi possível renomear", description: friendlyError(error), tone: "danger" }),
            },
          );
        }}
      >
        <Field
          label="Nome"
          value={name}
          maxLength={180}
          onChange={(e) => setName(e.target.value)}
          hint={extension ? `A extensão ${extension} é mantida.` : undefined}
          autoFocus
        />
      </form>
    </Sheet>
  );
}

function MoveSheet({ files, subjects, onClose }: { files: StoredFile[]; subjects: Subject[]; onClose: () => void }) {
  const move = useMoveFiles();
  const current = files.length === 1 ? files[0].subject_id : undefined;
  const options = [{ id: null as string | null, name: "Sem matéria" }, ...subjects.filter((s) => !s.archived)];
  return (
    <Sheet
      open
      onClose={onClose}
      title={files.length === 1 ? "Mudar de matéria" : `Mudar ${files.length} arquivos de matéria`}
      size="s"
    >
      <div className="flex flex-col gap-1" role="group" aria-label="Matérias">
        {options.map((s) => (
          <button
            key={s.id ?? "none"}
            type="button"
            aria-pressed={current === s.id}
            disabled={move.isPending}
            className={cn(row, current === s.id && "bg-active")}
            onClick={() =>
              move.mutate(
                { ids: files.map((f) => f.id), subjectId: s.id },
                {
                  onSuccess: onClose,
                  onError: (error) =>
                    toast({
                      title: "Não foi possível mudar de matéria",
                      description: friendlyError(error),
                      tone: "danger",
                    }),
                },
              )
            }
          >
            {s.name}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function DeleteDialog({
  files,
  onClose,
  onDeleted,
}: {
  files: StoredFile[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const remove = useDeleteFiles();
  const one = files.length === 1;
  return (
    <ConfirmDialog
      open
      title={one ? "Excluir arquivo?" : `Excluir ${files.length} arquivos?`}
      description={
        one
          ? `“${files[0].name}” e o texto lido dele serão apagados. Não dá para desfazer.`
          : "Os arquivos e o texto lido deles serão apagados. Não dá para desfazer."
      }
      confirmLabel="Excluir"
      danger
      busy={remove.isPending}
      onClose={onClose}
      onConfirm={() =>
        remove.mutate(files, {
          onSuccess: () => {
            onDeleted();
            onClose();
          },
          onError: (error) =>
            toast({ title: "Não foi possível excluir", description: friendlyError(error), tone: "danger" }),
        })
      }
    />
  );
}

/** The dialog that is open for a file (or a selection), if any. */
export function FileDialogs({
  dialog,
  statuses,
  subjects,
  onChange,
  onDeleted,
}: {
  dialog: FileDialog;
  statuses: Map<string, FileStatus>;
  subjects: Subject[];
  onChange: (dialog: FileDialog) => void;
  onDeleted: (ids: string[]) => void;
}) {
  const close = () => onChange(null);
  // A file deleted elsewhere (another tab) closes its dialog.
  useEffect(() => {
    if (dialog && dialog.files.length === 0) onChange(null);
  }, [dialog, onChange]);
  if (!dialog || dialog.files.length === 0) return null;
  const [first] = dialog.files;
  switch (dialog.mode) {
    case "actions":
      return (
        <ActionsSheet
          file={first}
          status={statuses.get(first.id) ?? { kind: "interrompida" }}
          subject={subjects.find((s) => s.id === first.subject_id)}
          onClose={close}
          onChoose={onChange}
        />
      );
    case "preview":
      return <TextPreviewSheet file={first} onClose={close} />;
    case "rename":
      return <RenameSheet file={first} onClose={close} />;
    case "move":
      return <MoveSheet files={dialog.files} subjects={subjects} onClose={close} />;
    case "delete":
      return (
        <DeleteDialog files={dialog.files} onClose={close} onDeleted={() => onDeleted(dialog.files.map((f) => f.id))} />
      );
  }
}
