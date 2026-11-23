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
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, FileUp, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { TopicRow } from "@/lib/subjects/subjects";
import { friendlyError } from "@/lib/supabase/errors";
import { useAddTopics, useDeleteTopic, useMoveTopic, useUpdateTopic } from "./queries";

function notifyError(title: string) {
  return (error: unknown) => toast({ title, description: friendlyError(error), tone: "danger" });
}

function TopicItem({ topic }: { topic: TopicRow }) {
  const update = useUpdateTopic();
  const remove = useDeleteTopic();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(topic.title);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: topic.id,
  });

  function saveTitle(event: FormEvent) {
    event.preventDefault();
    const next = title.trim();
    setEditing(false);
    if (!next || next === topic.title) {
      setTitle(topic.title);
      return;
    }
    update.mutate(
      { id: topic.id, patch: { title: next.slice(0, 200) } },
      { onError: notifyError("Não foi possível renomear") },
    );
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex min-w-0 items-center gap-1 rounded-lg bg-surface-alt py-1 pr-1 pl-1",
        isDragging && "relative z-10 shadow-float",
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`Mover “${topic.title}”`}
        className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-fg-2 hover:bg-surface active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden size={18} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        role="checkbox"
        aria-checked={topic.done}
        aria-label={topic.title}
        onClick={() =>
          update.mutate(
            { id: topic.id, patch: { done: !topic.done } },
            { onError: notifyError("Não foi possível salvar") },
          )
        }
        className="flex size-11 shrink-0 items-center justify-center"
      >
        <span
          aria-hidden
          className={cn(
            "flex size-[26px] items-center justify-center rounded-sm border-[1.5px] transition-colors duration-150",
            topic.done ? "border-btn bg-btn text-white" : "border-checkbox bg-surface",
          )}
        >
          {topic.done && <Check size={16} strokeWidth={2.5} />}
        </span>
      </button>
      {editing ? (
        <form onSubmit={saveTitle} className="min-w-0 flex-1">
          <Input
            aria-label="Nome do tópico"
            value={title}
            maxLength={200}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setTitle(topic.title);
                setEditing(false);
              }
            }}
            className="h-10"
          />
        </form>
      ) : (
        <span
          className={cn("min-w-0 flex-1 text-sm wrap-break-word", topic.done ? "text-fg-2 line-through" : "text-fg")}
        >
          {topic.title}
        </span>
      )}
      {!editing && (
        <>
          <IconButton
            icon={Pencil}
            label={`Renomear “${topic.title}”`}
            variant="ghost"
            onClick={() => {
              setTitle(topic.title);
              setEditing(true);
            }}
          />
          <IconButton
            icon={Trash2}
            label={`Excluir “${topic.title}”`}
            variant="ghost"
            onClick={() =>
              remove.mutate(topic.id, {
                onSuccess: () => toast({ title: "Tópico excluído", description: topic.title }),
                onError: notifyError("Não foi possível excluir"),
              })
            }
          />
        </>
      )}
    </li>
  );
}

interface TopicsChecklistProps {
  subjectId: string;
  topics: readonly TopicRow[];
  onImport: () => void;
}

/**
 * "Conteúdo da matéria do plano de ensino": checklist in two columns on wider screens. Drag by the
 * handle with finger, pen or mouse; with the keyboard, focus the handle, press Space, move with the
 * arrows and Space again. The rest of the row scrolls normally on touch.
 */
export function TopicsChecklist({ subjectId, topics, onImport }: TopicsChecklistProps) {
  const add = useAddTopics();
  const move = useMoveTopic();
  const [draft, setDraft] = useState("");
  const inputId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const to = topics.findIndex((t) => t.id === over.id);
    move.move(topics, String(active.id), to);
  }

  async function addTopic(event: FormEvent) {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    try {
      await add.mutateAsync({ subjectId, titles: [title.slice(0, 200)] });
      setDraft("");
    } catch (error) {
      notifyError("Não foi possível adicionar")(error);
    }
  }

  const titleOf = (id: string | number) => topics.find((t) => t.id === id)?.title ?? "tópico";

  return (
    <div className="flex flex-col gap-3">
      {topics.length === 0 ? (
        <p className="type-body m-0 text-fg-2">
          Nenhum tópico ainda. Adicione um por um ou importe o plano de ensino de uma vez.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{
            screenReaderInstructions: {
              draggable:
                "Para mover, aperte Espaço ou Enter, use as setas e aperte Espaço ou Enter de novo para soltar. Esc cancela.",
            },
            announcements: {
              onDragStart: ({ active }) => `Movendo “${titleOf(active.id)}”.`,
              onDragOver: ({ active, over }) =>
                over ? `“${titleOf(active.id)}” sobre a posição de “${titleOf(over.id)}”.` : undefined,
              onDragEnd: ({ active, over }) =>
                over ? `“${titleOf(active.id)}” solto na posição de “${titleOf(over.id)}”.` : "Movimento cancelado.",
              onDragCancel: () => "Movimento cancelado.",
            },
          }}
        >
          <SortableContext items={topics.map((t) => t.id)} strategy={rectSortingStrategy}>
            <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 xl:grid-cols-2">
              {topics.map((topic) => (
                <TopicItem key={topic.id} topic={topic} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      <form onSubmit={addTopic} className="flex flex-wrap items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          Novo tópico
        </label>
        <Input
          id={inputId}
          value={draft}
          maxLength={200}
          placeholder="Novo tópico, como “Sistema muscular”"
          onChange={(e) => setDraft(e.target.value)}
          className="min-w-0 flex-1 basis-56"
        />
        <Button type="submit" variant="secondary" icon={Plus} disabled={!draft.trim() || add.isPending}>
          Adicionar
        </Button>
        <Button variant="ghost" icon={FileUp} onClick={onImport}>
          Importar plano
        </Button>
      </form>
    </div>
  );
}
