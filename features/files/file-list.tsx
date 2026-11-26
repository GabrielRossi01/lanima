"use client";

import { FolderInput, ListChecks, MoreHorizontal, Sparkles, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SubjectChip } from "@/components/ui/chip";
import { IconButton } from "@/components/ui/icon-button";
import { IconTile } from "@/components/ui/icon-tile";
import { todayIn } from "@/lib/dates/calendar";
import { cn } from "@/lib/cn";
import { formatBytes, KIND_LABELS } from "@/lib/files/files";
import { dayLabel, type FileStatus } from "@/lib/files/status";
import { useNow } from "@/lib/hooks/use-now";
import { useOnline } from "@/lib/hooks/use-online";
import { newTestHref, summarizeHref } from "@/lib/study/links";
import type { Subject } from "@/lib/subjects/subjects";
import { FileDialogs, type FileDialog } from "./file-dialogs";
import type { StoredFile } from "./queries";
import { KIND_ICONS, StatusBadge, statusDetail } from "./status-badge";

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        className="size-5 cursor-pointer accent-(--color-btn)"
      />
    </label>
  );
}

function NameCell({
  file,
  status,
  meta,
  onOpen,
}: {
  file: StoredFile;
  status: FileStatus;
  meta: string;
  onOpen: () => void;
}) {
  const detail = statusDetail(status);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <IconTile icon={KIND_ICONS[file.kind]} size={40} />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <button
          type="button"
          onClick={onOpen}
          className="max-w-full truncate text-left text-sm font-semibold text-fg hover:underline"
          title={file.name}
        >
          {file.name}
        </button>
        <StatusBadge status={status} />
        {detail && <span className="type-caption max-w-full text-fg-2">{detail}</span>}
        <span className="type-caption max-w-full truncate text-fg-2">{meta}</span>
      </div>
    </div>
  );
}

function SubjectCell({ subject }: { subject: Subject | undefined }) {
  return subject ? (
    <SubjectChip color={subject.color} size="s">
      {subject.name}
    </SubjectChip>
  ) : (
    <span className="text-sm text-fg-2">Sem matéria</span>
  );
}

/**
 * The files (section 7.9): a table from the tablet up, a list on the phone. Each file has a menu of
 * actions; several can be selected to summarize together, make a test, move or delete.
 */
export function FileList({
  files,
  statuses,
  subjects,
  showSubject = true,
  highlight,
}: {
  files: StoredFile[];
  statuses: Map<string, FileStatus>;
  subjects: Subject[];
  showSubject?: boolean;
  /** File to point at (from the search): scrolled to and its menu opened. */
  highlight?: string | null;
}) {
  const online = useOnline();
  const now = useNow();
  const today = now ? todayIn(now) : null;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialogState] = useState<FileDialog>(null);
  const subjectOf = (id: string | null) => subjects.find((s) => s.id === id);

  // The open dialog follows the list: a rename or a reading updates it, a delete elsewhere closes it.
  const live = dialog && {
    ...dialog,
    files: dialog.files.map((f) => files.find((g) => g.id === f.id)).filter((f) => f !== undefined),
  };
  const setDialog = useCallback((next: FileDialog) => setDialogState(next), []);

  useEffect(() => {
    if (!highlight) return;
    const file = files.find((f) => f.id === highlight);
    if (!file) return;
    document.getElementById(`arquivo-${file.id}`)?.scrollIntoView({ block: "center" });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Opens the menu once the file is listed.
    setDialogState({ mode: "actions", files: [file] });
    // Only when the file to point at changes, not on every list refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight, files.length > 0]);

  const chosen = files.filter((f) => selected.has(f.id));
  // "Resumir juntos" and "Criar teste" take the ones whose text is read.
  const readyIds = chosen.filter((f) => f.document?.status === "pronto").map((f) => f.id);
  const subjectIds = new Set(chosen.map((f) => f.subject_id));
  const sharedSubject = subjectIds.size === 1 ? [...subjectIds][0] : null;
  const router = useRouter();
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const allSelected = files.length > 0 && chosen.length === files.length;
  const status = (f: StoredFile): FileStatus => statuses.get(f.id) ?? { kind: "interrompida" };
  const actions = (f: StoredFile) => setDialogState({ mode: "actions", files: [f] });
  /** "Anatomia · PDF · 3 KB · Hoje" */
  const meta = (f: StoredFile, withSubject: boolean) =>
    [
      withSubject ? (subjectOf(f.subject_id)?.name ?? "Sem matéria") : null,
      KIND_LABELS[f.kind],
      formatBytes(f.size_bytes),
      today ? dayLabel(f.created_at, today) : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <>
      {chosen.length > 0 && (
        <div
          role="region"
          aria-label="Arquivos selecionados"
          className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-card bg-deep px-4 py-2 text-white shadow-card"
        >
          <span className="mr-auto text-sm font-semibold">
            {chosen.length === 1 ? "1 selecionado" : `${chosen.length} selecionados`}
          </span>
          <Button
            variant="inverse"
            size="s"
            icon={Sparkles}
            disabled={!online || readyIds.length === 0}
            onClick={() => router.push(summarizeHref(readyIds))}
          >
            Resumir juntos
          </Button>
          <Button
            variant="inverse"
            size="s"
            icon={ListChecks}
            disabled={!online || readyIds.length === 0}
            onClick={() => router.push(newTestHref({ fileIds: readyIds, subjectId: sharedSubject }))}
          >
            Criar teste
          </Button>
          <Button
            variant="inverse"
            size="s"
            icon={FolderInput}
            disabled={!online}
            onClick={() => setDialogState({ mode: "move", files: chosen })}
          >
            Mudar de matéria
          </Button>
          <Button
            variant="inverse"
            size="s"
            icon={Trash2}
            disabled={!online}
            onClick={() => setDialogState({ mode: "delete", files: chosen })}
          >
            Excluir
          </Button>
          <IconButton
            icon={X}
            label="Cancelar a seleção"
            variant="ghost"
            className="text-white"
            onClick={() => setSelected(new Set())}
          />
        </div>
      )}

      {/* Wide screens: table. Narrower (phone, tablet upright): list. */}
      <div className="hidden overflow-hidden rounded-card border border-line bg-surface lg:block">
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">Arquivos</caption>
          <thead>
            <tr className="border-b border-line text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-fg-2">
              <th scope="col" className="w-14 py-2 pl-2">
                <Checkbox
                  checked={allSelected}
                  onChange={(on) => setSelected(on ? new Set(files.map((f) => f.id)) : new Set())}
                  label="Selecionar todos"
                />
              </th>
              <th scope="col" className="py-2 pr-3">
                Nome
              </th>
              {showSubject && (
                <th scope="col" className="w-48 py-2 pr-3">
                  Matéria
                </th>
              )}
              <th scope="col" className="w-16 py-2 pr-2">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr
                key={f.id}
                id={`arquivo-${f.id}`}
                className={cn("border-b border-line last:border-b-0", selected.has(f.id) && "bg-active")}
              >
                <td className="py-3 pl-2 align-middle">
                  <Checkbox
                    checked={selected.has(f.id)}
                    onChange={(on) => toggle(f.id, on)}
                    label={`Selecionar ${f.name}`}
                  />
                </td>
                <td className="py-3 pr-3 align-middle">
                  <NameCell file={f} status={status(f)} meta={meta(f, false)} onOpen={() => actions(f)} />
                </td>
                {showSubject && (
                  <td className="py-3 pr-3 align-middle">
                    <SubjectCell subject={subjectOf(f.subject_id)} />
                  </td>
                )}
                <td className="py-3 pr-2 align-middle">
                  <IconButton
                    icon={MoreHorizontal}
                    label={`Ações: ${f.name}`}
                    variant="ghost"
                    onClick={() => actions(f)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone: list. */}
      <ul className="m-0 flex list-none flex-col gap-2 p-0 lg:hidden" aria-label="Arquivos">
        {files.map((f) => (
          <li
            key={f.id}
            id={`arquivo-${f.id}-celular`}
            className={cn(
              "flex items-center gap-1 rounded-card border border-line bg-surface py-2 pr-1",
              selected.has(f.id) && "bg-active",
            )}
          >
            <Checkbox checked={selected.has(f.id)} onChange={(on) => toggle(f.id, on)} label={`Selecionar ${f.name}`} />
            <div className="min-w-0 flex-1">
              <NameCell file={f} status={status(f)} meta={meta(f, showSubject)} onOpen={() => actions(f)} />
            </div>
            <IconButton icon={MoreHorizontal} label={`Ações: ${f.name}`} variant="ghost" onClick={() => actions(f)} />
          </li>
        ))}
      </ul>

      <FileDialogs
        dialog={live as FileDialog}
        statuses={statuses}
        subjects={subjects}
        onChange={setDialog}
        onDeleted={(ids) =>
          setSelected((s) => {
            const next = new Set(s);
            ids.forEach((id) => next.delete(id));
            return next;
          })
        }
      />
    </>
  );
}
