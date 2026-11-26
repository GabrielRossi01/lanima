"use client";

import { Archive, Cloud, FolderOpen, ListChecks, NotebookPen, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { FilterChip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StudyPdfSheet } from "@/features/study/pdf-sheets";
import { useSubjects } from "@/features/subjects/queries";
import { formatBytes, matchesFilter, QUOTA_BYTES, type KindFilter } from "@/lib/files/files";
import { errorTag } from "@/lib/supabase/errors";
import { FileList } from "./file-list";
import { useFiles } from "./queries";
import { UploadPanel } from "./upload-panel";
import { useFileStatuses, usedBytes } from "./use-file-statuses";

const FILTERS: readonly { value: KindFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "pdf", label: "PDFs" },
  { value: "foto", label: "Fotos" },
  { value: "documento", label: "Documentos" },
];

const ALL_SUBJECTS = "todas";
const NO_SUBJECT = "nenhuma";

export function StorageCard() {
  const files = useFiles();
  const used = usedBytes(files.data);
  const share = Math.min(100, (used / QUOTA_BYTES) * 100);
  return (
    <Card>
      <CardHeader title="Armazenamento" as="h2" />
      <p className="m-0 text-sm">
        <span className="font-display text-2xl text-fg">{formatBytes(used)}</span>
        <span className="text-fg-2"> de {formatBytes(QUOTA_BYTES)}</span>
      </p>
      <ProgressBar
        value={share}
        label="Espaço usado"
        tone={share >= 90 ? "danger" : share >= 75 ? "warning" : "brand"}
      />
      <p className="type-caption m-0 text-fg-2">Cada conta tem 250 MB. As fotos são comprimidas antes de enviar.</p>
    </Card>
  );
}

function ImportCard() {
  return (
    <Card>
      <CardHeader title="Importar de" as="h2" />
      <div className="flex items-start gap-3">
        <Cloud aria-hidden size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-accent" />
        <div className="flex flex-col gap-1">
          <p className="m-0 text-sm font-semibold">Google Drive ou iCloud</p>
          <p className="type-caption m-0 text-fg-2">
            Em “Escolher arquivos”, abra o Drive ou o iCloud no seletor (no iPad e no iPhone, em Locais). No computador,
            use a pasta do Drive para computador.
          </p>
        </div>
      </div>
    </Card>
  );
}

/** Arquivos.html, "Exportar": what can be taken out of the app, made on the device. */
function ExportCard() {
  const [open, setOpen] = useState(false);
  const row = (icon: LucideIcon, title: string, detail: string, onClick?: () => void) => {
    const Icon = icon;
    const body = (
      <>
        <Icon aria-hidden size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-accent" />
        <span className="flex min-w-0 flex-col gap-0.5 text-left">
          <span className="text-sm font-semibold">{title}</span>
          <span className="type-caption text-fg-2">{detail}</span>
        </span>
      </>
    );
    return onClick ? (
      <button
        type="button"
        onClick={onClick}
        className="-mx-2 flex min-h-12 items-start gap-3 rounded-md px-2 py-1.5 hover:bg-surface-alt"
      >
        {body}
      </button>
    ) : (
      <div className="flex items-start gap-3 py-1.5 opacity-60">{body}</div>
    );
  };
  return (
    <Card>
      <CardHeader title="Exportar" as="h2" />
      <div className="flex flex-col gap-1">
        {row(ListChecks, "Resumos e testes", "PDF, com gabarito no fim", () => setOpen(true))}
        {row(NotebookPen, "Caderno em PDF", "Chega com o caderno, na fase 7")}
        {row(Archive, "Backup completo", "Arquivo .zip com tudo, na fase 11")}
      </div>
      {open && <StudyPdfSheet open onClose={() => setOpen(false)} />}
    </Card>
  );
}

/** The file to point at, from a search result (/arquivos#arquivo-<id>). */
function useHashTarget(): string | null {
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    const read = () => {
      const match = /^#arquivo-([0-9a-f-]{36})$/.exec(window.location.hash);
      setTarget(match ? match[1] : null);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  return target;
}

/** Arquivos (Arquivos.html, section 7.9). */
export function FilesView() {
  const files = useFiles();
  const subjects = useSubjects().data ?? [];
  const [kind, setKind] = useState<KindFilter>("todos");
  const [subject, setSubject] = useState(ALL_SUBJECTS);
  const list = files.data ?? [];
  const statuses = useFileStatuses(list);
  const target = useHashTarget();

  const bySubject = list.filter((f) =>
    subject === ALL_SUBJECTS ? true : subject === NO_SUBJECT ? f.subject_id === null : f.subject_id === subject,
  );
  const visible = bySubject.filter((f) => matchesFilter(f.kind, kind));
  const usedSubjects = subjects.filter((s) => list.some((f) => f.subject_id === s.id));

  return (
    <>
      <PageHeader title="Arquivos" subtitle="Tudo o que você enviou, separado por matéria" />
      {/* The cards sit beside the upload area, so the table below gets the whole width. */}
      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <UploadPanel />
        <aside className="flex flex-col gap-5 max-lg:order-last" aria-label="Espaço, importação e exportação">
          <StorageCard />
          <ImportCard />
          <ExportCard />
        </aside>
        <div className="flex min-w-0 flex-col gap-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo">
              {FILTERS.map((f) => (
                <FilterChip
                  key={f.value}
                  selected={kind === f.value}
                  count={files.data ? bySubject.filter((x) => matchesFilter(x.kind, f.value)).length : undefined}
                  onClick={() => setKind(f.value)}
                >
                  {f.label}
                </FilterChip>
              ))}
            </div>
            {usedSubjects.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-fg-2">
                Matéria:
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="h-10 max-w-[200px] rounded-full border border-line-strong bg-surface px-3 text-sm font-semibold text-fg"
                >
                  <option value={ALL_SUBJECTS}>Todas</option>
                  {usedSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  <option value={NO_SUBJECT}>Sem matéria</option>
                </select>
              </label>
            )}
          </div>

          {files.error && !files.data ? (
            <Card>
              <p className="type-body m-0">Não foi possível carregar os arquivos.</p>
              <p className="type-caption m-0 text-fg-2">arquivos: {errorTag(files.error)}</p>
              <Button variant="secondary" className="self-start" onClick={() => void files.refetch()}>
                Tentar de novo
              </Button>
            </Card>
          ) : !files.data ? (
            <div aria-busy className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-card bg-surface-alt motion-reduce:animate-none" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title={list.length === 0 ? "Nenhum arquivo ainda" : "Nenhum arquivo neste filtro"}
              description={
                list.length === 0
                  ? "Envie PDFs, slides, documentos do Word ou fotos de lâminas e de páginas de livro. O texto deles é lido aqui no aparelho."
                  : undefined
              }
            />
          ) : (
            <FileList files={visible} statuses={statuses} subjects={subjects} highlight={target} />
          )}
        </div>
      </div>
    </>
  );
}
