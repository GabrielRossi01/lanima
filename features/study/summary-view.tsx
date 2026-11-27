"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  FileText,
  GripVertical,
  ListChecks,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { SubjectChip } from "@/components/ui/chip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-provider";
import { fileLink, useFiles, type StoredFile } from "@/features/files/queries";
import { TextPreviewSheet } from "@/features/files/text-preview";
import { useSubjects } from "@/features/subjects/queries";
import { DETAIL_LABELS, HIGHLIGHTS, type Point, type SummaryContent } from "@/lib/ai/schemas";
import { cn } from "@/lib/cn";
import { todayIn } from "@/lib/dates/calendar";
import { shortDay } from "@/lib/study/format";
import {
  addPoint,
  addTopic,
  deletePoint,
  deleteTopic,
  movePoint,
  pointCount,
  pointNumber,
  pointsLabel,
  renameTopic,
  updatePoint,
  type Highlight,
  type PointPath,
} from "@/lib/study/summary";
import { friendlyError } from "@/lib/supabase/errors";
import { useQueryClient } from "@tanstack/react-query";
import { exportPdf, longDate } from "./export-pdf";
import { summariesKey, useDeleteSummary, useSaveSummaryContent, useSummary, type Summary } from "./queries";
import { AiDisclaimer } from "./study-view";
import { useSaveState, type SaveState } from "./summary-sync";

/** Section 6: a discreet sign of what happened to her edits. */
const SAVE_LABELS: Record<SaveState, string> = {
  salvo: "Salvo",
  salvando: "Salvando…",
  offline: "Offline · será sincronizado",
};
import { AiFailureCard, AiProgress, useGenerate } from "./use-generate";

const MARKER: Record<Highlight, string> = {
  amarelo: "var(--marker-yellow)",
  rosa: "var(--marker-pink)",
  verde: "var(--marker-green)",
  celeste: "var(--marker-sky)",
  lilas: "var(--marker-lilac)",
};
const MARKER_LABEL: Record<Highlight, string> = {
  amarelo: "Amarelo",
  rosa: "Rosa",
  verde: "Verde",
  celeste: "Celeste",
  lilas: "Lilás",
};

/** Files of the summary by reading id, to name and open the sources. */
function useSourceFiles(summary: Summary | undefined) {
  const files = useFiles().data ?? [];
  const byDocument = new Map<string, StoredFile>();
  for (const f of files) if (f.document) byDocument.set(f.document.id, f);
  return { byDocument, loaded: useFiles().data !== undefined, summaryDocs: summary?.document_ids ?? [] };
}

/** Opens the file at the page (PDFs) or its text (the other kinds). */
function SourceButton({
  file,
  page,
  onPreview,
}: {
  file: StoredFile | undefined;
  page: number;
  onPreview: (file: StoredFile) => void;
}) {
  const label = file ? `${file.name.replace(/\.[^.]+$/, "")} · p. ${page}` : `Arquivo excluído · p. ${page}`;
  const classes =
    "inline-flex min-h-6 max-w-[220px] shrink-0 items-center gap-1 rounded-sm bg-surface-alt px-2 text-xs font-medium text-accent";
  if (!file) return <span className={classes}>{label}</span>;
  async function open() {
    if (file!.kind !== "pdf") return onPreview(file!);
    // Opened right away, so the browser doesn't take it for a pop-up; the address comes next.
    const tab = window.open("about:blank", "_blank");
    try {
      const url = `${await fileLink(file!, false)}#page=${page}`;
      if (tab) tab.location.href = url;
      else window.open(url, "_blank");
    } catch (error) {
      tab?.close();
      toast({ title: "Não foi possível abrir o arquivo", description: friendlyError(error), tone: "danger" });
    }
  }
  return (
    <button
      type="button"
      onClick={() => void open()}
      aria-label={`Abrir fonte: ${label}`}
      className={cn(classes, "relative cursor-pointer hover:bg-active")}
    >
      <FileText aria-hidden size={13} strokeWidth={1.75} className="shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

interface PointRowProps {
  point: Point;
  path: PointPath;
  editing: boolean;
  file: StoredFile | undefined;
  onPreview: (file: StoredFile) => void;
  onMark: () => void;
  onSave: (texto: string) => void;
  onDelete: () => void;
}

function PointRow({ point, path, editing, file, onPreview, onMark, onSave, onDelete }: PointRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: point.id,
    disabled: !editing,
  });
  const [text, setText] = useState(point.texto);
  const [writing, setWriting] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const number = pointNumber(path);
  const marked = point.destaque ?? null;

  // Long press opens the highlighter too (section 7.5: "tocar e segurar").
  const startHold = () => {
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      onMark();
    }, 500);
  };
  const cancelHold = () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  function save(event: FormEvent) {
    event.preventDefault();
    setWriting(false);
    const next = text.trim();
    if (next && next !== point.texto) onSave(next.slice(0, 1500));
    else setText(point.texto);
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-start gap-2.5", isDragging && "relative z-10 rounded-md bg-surface shadow-float")}
    >
      {editing && (
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={`Mover o ponto ${number}`}
          className="-my-2 flex size-10 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-fg-2 hover:bg-surface-alt active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden size={18} strokeWidth={1.75} />
        </button>
      )}
      <span className="min-w-7 text-[13px] leading-[22px] font-semibold text-fg-2 tabular-nums">{number}</span>
      {editing && writing ? (
        <form onSubmit={save} className="flex flex-1 flex-col gap-2">
          <label className="sr-only" htmlFor={`ponto-${point.id}`}>
            Texto do ponto {number}
          </label>
          <textarea
            id={`ponto-${point.id}`}
            autoFocus
            value={text}
            maxLength={1500}
            rows={3}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded-md border border-line-strong bg-surface p-2.5 text-[15px] leading-[22px] text-fg"
          />
          <div className="flex gap-2">
            <Button size="s" type="submit">
              Salvar
            </Button>
            <Button
              size="s"
              variant="ghost"
              onClick={() => {
                setText(point.texto);
                setWriting(false);
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          aria-label={editing ? `Editar o ponto ${number}` : `Destacar com marca-texto: ${point.texto}`}
          aria-pressed={editing ? undefined : marked !== null}
          onClick={() => (editing ? setWriting(true) : onMark())}
          onPointerDown={editing ? undefined : startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          onContextMenu={(e) => e.preventDefault()}
          className="flex-1 cursor-pointer border-0 bg-transparent p-0 text-left text-fg select-none"
        >
          <span
            className="rounded-[4px] px-0.5 text-[15px] leading-[22px] [box-decoration-break:clone]"
            style={marked ? { background: MARKER[marked] } : undefined}
          >
            {point.texto}
          </span>
        </button>
      )}
      {point.fonte ? (
        <SourceButton file={file} page={point.fonte.pagina} onPreview={onPreview} />
      ) : (
        <span className="inline-flex min-h-6 shrink-0 items-center rounded-sm bg-subtle px-2 text-xs text-fg-2">
          seu ponto
        </span>
      )}
      {editing && (
        <IconButton icon={Trash2} label={`Excluir o ponto ${number}`} size="s" variant="ghost" onClick={onDelete} />
      )}
    </li>
  );
}

function AddLine({ label, onAdd }: { label: string; onAdd: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const id = useId();
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-10 self-start rounded-full border border-dashed border-line-strong bg-transparent px-3.5 text-[13px] font-semibold text-accent"
      >
        + {label}
      </button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onAdd(text.trim().slice(0, 1500));
        setText("");
        setOpen(false);
      }}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className="h-10 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-3 text-sm text-fg"
        placeholder={label}
      />
      <Button size="s" type="submit">
        Adicionar
      </Button>
    </form>
  );
}

function PointList({
  points,
  topic,
  sub,
  render,
  onMove,
}: {
  points: Point[];
  topic: number;
  sub: number | null;
  render: (point: Point, path: PointPath) => ReactNode;
  onMove: (path: PointPath, to: number) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const numberOf = (pointId: string | number) =>
    pointNumber({ topic, sub, point: points.findIndex((p) => p.id === pointId) });
  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = points.findIndex((p) => p.id === active.id);
    const to = points.findIndex((p) => p.id === over.id);
    onMove({ topic, sub, point: from }, to);
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable: "Para mover, aperte Espaço, use as setas e aperte Espaço de novo para soltar. Esc cancela.",
        },
        announcements: {
          onDragStart: ({ active }) => `Movendo o ponto ${numberOf(active.id)}.`,
          onDragOver: ({ active, over }) =>
            over ? `Ponto ${numberOf(active.id)} sobre a posição ${numberOf(over.id)}.` : undefined,
          onDragEnd: ({ active, over }) =>
            over ? `Ponto ${numberOf(active.id)} solto na posição ${numberOf(over.id)}.` : "Movimento cancelado.",
          onDragCancel: () => "Movimento cancelado.",
        },
      }}
    >
      <SortableContext items={points.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {points.map((point, i) => render(point, { topic, sub, point: i }))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

/** The name of a topic, editable while editing; saved when she leaves the field or presses Enter. */
function TopicTitleInput({ value, label, onSave }: { value: string; label: string; onSave: (title: string) => void }) {
  const [text, setText] = useState(value);
  const done = () => {
    const next = text.trim().slice(0, 200);
    if (next && next !== value) onSave(next);
    else setText(value);
  };
  return (
    <input
      aria-label={label}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={done}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === " ") e.stopPropagation();
      }}
      className="h-10 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-3 text-base font-semibold text-fg"
    />
  );
}

function MarkerSheet({
  point,
  onPick,
  onClose,
}: {
  point: Point | null;
  onPick: (color: Highlight | null) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={point !== null} onClose={onClose} title="Marca-texto" side="center" size="s">
      {point && (
        <div className="flex flex-col gap-4">
          <p className="type-body m-0 line-clamp-3 text-fg-2">{point.texto}</p>
          <div className="flex flex-wrap gap-2.5" role="group" aria-label="Cores">
            {HIGHLIGHTS.map((color) => (
              <button
                key={color}
                type="button"
                aria-pressed={point.destaque === color}
                aria-label={MARKER_LABEL[color]}
                onClick={() => onPick(color)}
                className="flex size-11 items-center justify-center rounded-full border border-line-strong"
                style={{ background: MARKER[color] }}
              >
                {point.destaque === color && <Check aria-hidden size={18} strokeWidth={2.5} className="text-fg" />}
              </button>
            ))}
          </div>
          {point.destaque && (
            <Button variant="secondary" className="self-start" onClick={() => onPick(null)}>
              Tirar o destaque
            </Button>
          )}
        </div>
      )}
    </Sheet>
  );
}

/** Resumo (Resumo.html): topics in an accordion with sources, highlighter, key terms and warnings. */
export function SummaryView({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const summaries = useSummary(id);
  const summary = summaries.data;
  const subjects = useSubjects().data ?? [];
  const { byDocument } = useSourceFiles(summary);
  const save = useSaveSummaryContent();
  const remove = useDeleteSummary();
  const saveState = useSaveState((s) => s.bySummary[id]);
  const { run, progress, failure, notice } = useGenerate();
  const [open, setOpen] = useState<Set<string> | null>(null);
  // "#topico-t3": a link from "Para revisar" in a result opens that topic.
  const [linked] = useState(() => (typeof window === "undefined" ? "" : window.location.hash.replace(/^#topico-/, "")));
  const loaded = Boolean(summary);
  useEffect(() => {
    if (linked && loaded) document.getElementById(`topico-${linked}`)?.scrollIntoView({ block: "start" });
  }, [linked, loaded]);
  const [editing, setEditing] = useState(false);
  const [marking, setMarking] = useState<PointPath | null>(null);
  const [preview, setPreview] = useState<StoredFile | null>(null);
  const [confirm, setConfirm] = useState<"regenerate" | "delete" | null>(null);
  const [exporting, setExporting] = useState(false);

  if (!summary) {
    if (summaries.isPending) {
      return (
        <div aria-busy className="flex flex-col gap-3">
          <div className="h-10 w-2/3 animate-pulse rounded-md bg-surface-alt motion-reduce:animate-none" />
          <div className="h-40 animate-pulse rounded-card bg-surface-alt motion-reduce:animate-none" />
        </div>
      );
    }
    return (
      <EmptyState
        icon={ListChecks}
        title="Resumo não encontrado"
        description="Ele pode ter sido excluído."
        action={
          <Link href="/estudo" className={buttonClasses("secondary", "m")}>
            Voltar para Resumos e testes
          </Link>
        }
      />
    );
  }

  const content = summary.content;
  const subject = subjects.find((s) => s.id === summary.subject_id);
  const today = todayIn(new Date());
  // Open at first: the first two topics, as in the mockup.
  const expanded = open ?? new Set([...content.topicos.slice(0, 2).map((t) => t.id), linked]);
  const toggleTopic = (topicId: string) =>
    setOpen(() => {
      const next = new Set(expanded);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });

  /** A change applied to the newest content (see useSaveSummaryContent); errors are told there. */
  function commit(change: (current: SummaryContent) => SummaryContent) {
    save.mutate({ id: summary!.id, change });
  }

  const pointAt = (path: PointPath | null): Point | null => {
    if (!path) return null;
    const topic = content.topicos[path.topic];
    const list = path.sub === null ? topic?.pontos : topic?.subtopicos?.[path.sub]?.pontos;
    return list?.[path.point] ?? null;
  };

  async function regenerate() {
    setConfirm(null);
    const result = await run("/api/ai/resumo", {
      documentIds: summary!.document_ids,
      detail: summary!.detail,
      focus: summary!.focus,
      subjectId: summary!.subject_id,
      replace: summary!.id,
    });
    if (result) {
      setOpen(null);
      await queryClient.invalidateQueries({ queryKey: summariesKey(user?.id) });
      toast({ title: "Resumo gerado de novo", tone: "success" });
    }
  }

  const renderPoint = (point: Point, path: PointPath) => (
    <PointRow
      key={point.id}
      point={point}
      path={path}
      editing={editing}
      file={point.fonte ? byDocument.get(point.fonte.documentId) : undefined}
      onPreview={setPreview}
      onMark={() => setMarking(path)}
      onSave={(texto) => commit((c) => updatePoint(c, path, { texto }))}
      onDelete={() => commit((c) => deletePoint(c, path))}
    />
  );
  const onMove = (path: PointPath, to: number) => commit((c) => movePoint(c, path, to));
  const sourceFiles = summary.document_ids.map((d) => byDocument.get(d));

  async function exportSummary() {
    setExporting(true);
    try {
      await exportPdf(summary!.title, (pdf, fonts) =>
        pdf.summaryPdf(
          {
            content: summary!.content,
            meta: [subject?.name, longDate(new Date())].filter(Boolean).join(" · "),
            fileName: (documentId) => byDocument.get(documentId)?.name.replace(/\.[^.]+$/, "") ?? null,
          },
          fonts,
        ),
      );
    } catch (error) {
      toast({ title: "Não foi possível exportar", description: friendlyError(error), tone: "danger" });
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      {/*
        The save state sits beside the trail, a single line that truncates: "Salvando…" turning into
        "Salvo" never changes the height of the header, so the list doesn't jump in the middle of a
        drag (it did on the phone, where the label wrapped to a line of its own).
      */}
      <div className="mb-3 flex min-w-0 items-center gap-3">
        <nav aria-label="Trilha" className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px]">
          <Link href="/estudo" className="shrink-0 font-medium">
            Resumos e testes
          </Link>
          <ChevronRight aria-hidden size={14} className="shrink-0 text-fg-2" />
          <span aria-current="page" className="truncate text-fg-2">
            {summary.title}
          </span>
        </nav>
        <span role="status" className="shrink-0 text-xs leading-5 font-semibold text-accent">
          {saveState ? SAVE_LABELS[saveState] : ""}
        </span>
      </div>
      <header className="mb-6 flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 font-serif text-[30px] leading-[38px] font-semibold tracking-[-0.5px] wrap-break-word">
            {summary.title}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {subject && (
              <SubjectChip color={subject.color} size="s">
                {subject.name}
              </SubjectChip>
            )}
            <span className="inline-flex h-6 items-center rounded-full bg-subtle px-2.5 text-xs font-medium text-fg-2">
              {DETAIL_LABELS[summary.detail]}
            </span>
            {sourceFiles.map((file, i) =>
              file ? (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => setPreview(file)}
                  className="inline-flex h-6 max-w-[240px] items-center gap-1 rounded-sm bg-surface-alt px-2 text-xs font-medium text-accent"
                >
                  <FileText aria-hidden size={13} strokeWidth={1.75} className="shrink-0" />
                  <span className="truncate">{file.name}</span>
                </button>
              ) : (
                <span key={i} className="inline-flex h-6 items-center rounded-sm bg-subtle px-2 text-xs text-fg-2">
                  Arquivo excluído
                </span>
              ),
            )}
            <span className="text-xs text-fg-2">
              {summary.edited_by_user
                ? `editado por você ${shortDay(summary.updated_at, today)}`
                : shortDay(summary.created_at, today)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <IconButton
            icon={RefreshCw}
            label="Gerar de novo"
            variant="outline"
            disabled={progress !== null}
            onClick={() => (summary.edited_by_user ? setConfirm("regenerate") : void regenerate())}
          />
          <IconButton
            icon={editing ? Check : Pencil}
            label={editing ? "Concluir edição" : "Editar resumo"}
            variant="outline"
            onClick={() => setEditing((e) => !e)}
          />
          <IconButton
            icon={Download}
            label="Exportar em PDF"
            variant="outline"
            disabled={exporting}
            onClick={() => void exportSummary()}
          />
          <IconButton icon={Trash2} label="Excluir resumo" variant="outline" onClick={() => setConfirm("delete")} />
          <Link href={`/estudo/novo-teste?resumo=${summary.id}`} className={buttonClasses("primary", "m")}>
            <ListChecks aria-hidden size={18} strokeWidth={1.75} />
            Criar teste deste resumo
          </Link>
        </div>
      </header>

      {progress !== null ? (
        <AiProgress message={progress} />
      ) : (
        <div className="flex flex-col gap-5 lg:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {failure && <AiFailureCard failure={failure} />}
            {editing && (
              <p role="status" className="m-0 rounded-md bg-surface-alt px-3 py-2 text-[13px] text-fg-2">
                Editando: toque num ponto para mudar o texto, arraste pela alça para reordenar.
              </p>
            )}
            <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
              {content.topicos.map((topic, t) => {
                const isOpen = editing || expanded.has(topic.id);
                return (
                  <li
                    key={topic.id}
                    id={`topico-${topic.id}`}
                    className="scroll-mt-4 overflow-hidden rounded-[18px] border border-line bg-surface"
                  >
                    <div className="flex items-center gap-1 pr-2">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => toggleTopic(topic.id)}
                        disabled={editing}
                        className="flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-3 border-0 bg-transparent px-[18px] text-left text-fg disabled:cursor-default"
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-active text-[13px] font-bold text-accent">
                          {t + 1}
                        </span>
                        {editing ? (
                          <TopicTitleInput
                            key={topic.titulo}
                            value={topic.titulo}
                            label={`Nome do tópico ${t + 1}`}
                            onSave={(title) => commit((c) => renameTopic(c, t, title))}
                          />
                        ) : (
                          <span className="min-w-0 flex-1 text-base font-semibold wrap-break-word">{topic.titulo}</span>
                        )}
                        <span className="text-xs text-fg-2">{pointsLabel(pointCount(topic))}</span>
                        {!editing &&
                          (isOpen ? (
                            <ChevronUp aria-hidden size={18} className="shrink-0 text-fg-2" />
                          ) : (
                            <ChevronDown aria-hidden size={18} className="shrink-0 text-fg-2" />
                          ))}
                      </button>
                      {editing && (
                        <>
                          <IconButton
                            icon={Trash2}
                            label={`Excluir o tópico ${t + 1}`}
                            size="s"
                            variant="ghost"
                            onClick={() => commit((c) => deleteTopic(c, t))}
                          />
                        </>
                      )}
                    </div>
                    {isOpen && (
                      <div className="flex flex-col gap-3 px-[18px] pb-3.5 md:pl-[58px]">
                        <PointList points={topic.pontos} topic={t} sub={null} render={renderPoint} onMove={onMove} />
                        {(topic.subtopicos ?? []).map((s, si) => (
                          <div key={s.id} className="flex flex-col gap-2">
                            <h3 className="m-0 text-sm font-semibold">
                              {t + 1}.{si + 1} {s.titulo}
                            </h3>
                            <PointList points={s.pontos} topic={t} sub={si} render={renderPoint} onMove={onMove} />
                          </div>
                        ))}
                        {editing && (
                          <AddLine
                            label="Adicionar ponto"
                            onAdd={(text) => commit((c) => addPoint(c, t, null, text))}
                          />
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            <AddLine label="Adicionar tópico" onAdd={(text) => commit((c) => addTopic(c, text.slice(0, 200)))} />
            <AiDisclaimer />
          </div>

          <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[290px]" aria-label="Termos e atenção">
            {content.termosChave.length > 0 && (
              <section className="flex flex-col gap-1 rounded-card border border-line bg-surface p-[18px] shadow-card">
                <h2 className="m-0 text-base font-semibold">Termos-chave</h2>
                <dl className="m-0">
                  {content.termosChave.map((term) => (
                    <div key={term.termo} className="flex flex-col gap-0.5 border-t border-line py-2.5">
                      <dt className="text-sm font-semibold">{term.termo}</dt>
                      <dd className="m-0 text-[13px] leading-[18px] text-fg-2">{term.definicao}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
            {content.pontosDeAtencao.length > 0 && (
              <section className="flex flex-col gap-2 rounded-card bg-surface-alt p-[18px]">
                <h2 className="m-0 flex items-center gap-2 text-base font-semibold">
                  <AlertTriangle aria-hidden size={18} strokeWidth={1.75} className="text-warning" />
                  Pontos de atenção
                </h2>
                <ul className="m-0 flex flex-col gap-1.5 pl-[18px] text-[13px] leading-[19px]">
                  {content.pontosDeAtencao.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      )}

      <MarkerSheet
        point={pointAt(marking)}
        onClose={() => setMarking(null)}
        onPick={(color) => {
          const path = marking;
          if (path) commit((c) => updatePoint(c, path, { destaque: color }));
          setMarking(null);
        }}
      />
      {preview && <TextPreviewSheet file={preview} onClose={() => setPreview(null)} />}
      <ConfirmDialog
        open={confirm === "regenerate"}
        title="Gerar de novo?"
        description="Você editou este resumo. Um novo resumo substitui o texto atual, com as suas edições e destaques."
        confirmLabel="Gerar de novo"
        onConfirm={() => void regenerate()}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        title="Excluir resumo?"
        description="O resumo sai da sua conta. Os arquivos e os testes feitos com ele continuam."
        confirmLabel="Excluir"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          remove.mutate(summary.id, {
            onSuccess: () => router.replace("/estudo"),
            onError: (error) =>
              toast({ title: "Não foi possível excluir", description: friendlyError(error), tone: "danger" }),
          })
        }
        onClose={() => setConfirm(null)}
      />
      {notice}
    </>
  );
}
