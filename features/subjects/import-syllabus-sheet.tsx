"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { parseSyllabus, type Subject } from "@/lib/subjects/subjects";
import { friendlyError } from "@/lib/supabase/errors";
import { useAddTopics } from "./queries";

interface ImportSyllabusSheetProps {
  open: boolean;
  onClose: () => void;
  subjects: readonly Subject[];
  /** Pre-selected subject (from the subject page); the picker hides when only this one applies. */
  subjectId?: string;
}

/**
 * "Importar plano de ensino": paste the syllabus, one topic per line; bullets and numbering are
 * removed and the preview shows exactly what will be saved. Reading PDFs comes in phase 5.
 */
export function ImportSyllabusSheet({ open, onClose, subjects, subjectId }: ImportSyllabusSheetProps) {
  const add = useAddTopics();
  const [text, setText] = useState("");
  const [target, setTarget] = useState(subjectId ?? "");
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setText("");
      setTarget(subjectId ?? subjects[0]?.id ?? "");
    }
  }
  const titles = parseSyllabus(text);
  const textId = useId();

  async function save() {
    if (!target || titles.length === 0) return;
    try {
      await add.mutateAsync({ subjectId: target, titles });
      const name = subjects.find((s) => s.id === target)?.name ?? "a matéria";
      toast({
        title: `${titles.length} ${titles.length === 1 ? "tópico adicionado" : "tópicos adicionados"}`,
        description: name,
        tone: "success",
      });
      onClose();
    } catch (error) {
      toast({ title: "Não foi possível importar", description: friendlyError(error), tone: "danger" });
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Importar plano de ensino"
      description="Cole o conteúdo do plano de ensino, um tópico por linha. Numeração e marcadores são removidos."
      size="m"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={add.isPending}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={add.isPending || !target || titles.length === 0}>
            {add.isPending
              ? "Importando…"
              : titles.length > 0
                ? `Adicionar ${titles.length} ${titles.length === 1 ? "tópico" : "tópicos"}`
                : "Adicionar"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!subjectId && (
          <SelectField label="Matéria" value={target} onChange={(e) => setTarget(e.target.value)}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={textId} className="text-[13px] font-semibold">
            Conteúdo
          </label>
          <textarea
            id={textId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={"1. Introdução e planos anatômicos\n2. Sistema esquelético\n3. Articulações"}
            className="touch-list w-full rounded-md border border-line-strong bg-surface px-3.5 py-3 text-sm leading-5 text-fg placeholder:text-fg-2"
          />
        </div>
        {titles.length > 0 && (
          <section aria-label="Prévia" className="flex flex-col gap-2">
            <h3 className="type-overline m-0 text-fg-2">Prévia · {titles.length}</h3>
            <ol className="m-0 flex max-h-56 list-decimal flex-col gap-1 overflow-y-auto rounded-md bg-surface-alt py-3 pr-3 pl-9 text-sm">
              {titles.map((t) => (
                <li key={t} className="wrap-break-word">
                  {t}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </Sheet>
  );
}
