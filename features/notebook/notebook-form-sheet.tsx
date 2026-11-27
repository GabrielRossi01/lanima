"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-provider";
import { useSubjects } from "@/features/subjects/queries";
import { cn } from "@/lib/cn";
import { editorHref } from "@/lib/notebook/links";
import { BACKGROUND_LABELS, PAGE_BACKGROUNDS, type PageBackground } from "@/lib/notebook/model";
import { createNotebook, updateNotebook } from "@/lib/notebook/sync";
import { SUBJECT_BG } from "@/lib/subjects/colors";
import type { NotebookWithPages } from "./queries";

interface NotebookFormSheetProps {
  open: boolean;
  onClose: () => void;
  /** Editing this notebook (title and subject); else a new one. */
  notebook?: NotebookWithPages | null;
  /** A new notebook starts in this subject (from the Matéria). */
  subjectId?: string | null;
}

const PREVIEW: Record<PageBackground, string> = {
  pontilhado: "bg-[radial-gradient(circle,var(--border-strong)_0.8px,transparent_1.1px)] bg-[length:7px_7px]",
  pautado: "bg-[repeating-linear-gradient(to_bottom,transparent_0_8px,var(--border)_8px_9px)]",
  liso: "",
};

/** "Novo caderno" (approved drawing) and "Renomear / mudar de matéria". Works offline. */
export function NotebookFormSheet({ open, onClose, notebook, subjectId }: NotebookFormSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={notebook ? "Editar caderno" : "Novo caderno"}
      side="right"
      className="md:w-[440px]"
    >
      {open && <NotebookForm key={notebook?.id ?? "novo"} notebook={notebook} subjectId={subjectId} onDone={onClose} />}
    </Sheet>
  );
}

function NotebookForm({
  notebook,
  subjectId,
  onDone,
}: {
  notebook?: NotebookWithPages | null;
  subjectId?: string | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const userId = useAuth().user?.id;
  const subjects = useSubjects();
  const [title, setTitle] = useState(notebook?.title ?? "");
  const [subject, setSubject] = useState<string | null>(notebook ? notebook.subjectId : (subjectId ?? null));
  const [background, setBackground] = useState<PageBackground>("pontilhado");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const options = (subjects.data ?? []).filter((s) => !s.archived || s.id === subject);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const name = title.trim();
    if (!name) return setError("Dê um título ao caderno.");
    if (name.length > 200) return setError("Use até 200 caracteres.");
    if (!userId) return;
    setBusy(true);
    try {
      if (notebook) {
        await updateNotebook(userId, notebook.id, { title: name, subjectId: subject });
        toast({ title: "Caderno salvo", tone: "success" });
        onDone();
      } else {
        const { pageId } = await createNotebook(userId, { subjectId: subject, title: name, background });
        onDone();
        // Offline, the service worker serves the saved editor page on a real navigation.
        if (navigator.onLine) router.push(editorHref(pageId));
        else window.location.assign(editorHref(pageId));
      }
    } catch (failure) {
      console.error("[lanima] caderno:", failure);
      toast({ title: "Não foi possível salvar o caderno", tone: "danger" });
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6 pt-1" noValidate>
      <Field
        label="Título"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          setError(undefined);
        }}
        placeholder="Ex.: Aula 08 · Tecido ósseo"
        maxLength={200}
        error={error}
        autoFocus={!notebook}
        enterKeyHint="done"
      />

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 p-0 text-[13px] font-semibold text-fg">Matéria</legend>
        <div role="radiogroup" aria-label="Matéria" className="flex flex-wrap gap-2">
          {[...options.map((s) => ({ id: s.id as string | null, name: s.name, color: s.color })), null].map(
            (option) => {
              const id = option?.id ?? null;
              const checked = subject === id;
              return (
                <button
                  key={id ?? "nenhuma"}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => setSubject(id)}
                  className={cn(
                    "inline-flex min-h-10 max-w-full items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors duration-150",
                    checked
                      ? "border-transparent bg-hl-sky text-ink"
                      : "border-line-strong bg-surface text-fg hover:bg-surface-alt",
                  )}
                >
                  {option && (
                    <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", SUBJECT_BG[option.color])} />
                  )}
                  <span className="min-w-0 truncate">{option ? option.name : "Sem matéria"}</span>
                </button>
              );
            },
          )}
        </div>
      </fieldset>

      {!notebook && (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-[13px] font-semibold text-fg">Fundo das páginas</legend>
          <div role="radiogroup" aria-label="Fundo das páginas" className="grid grid-cols-3 gap-2.5">
            {PAGE_BACKGROUNDS.map((kind) => {
              const checked = background === kind;
              return (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => setBackground(kind)}
                  className={cn(
                    "flex flex-col items-center gap-2.5 rounded-card border-2 px-2 pt-3.5 pb-3 text-sm font-semibold text-fg",
                    checked ? "border-btn bg-surface-alt" : "border-line bg-surface hover:bg-surface-alt",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "block h-[90px] w-16 rounded-[4px] bg-surface shadow-[0_1px_3px_rgba(31,42,51,0.18)]",
                      PREVIEW[kind],
                    )}
                  />
                  {BACKGROUND_LABELS[kind]}
                </button>
              );
            })}
          </div>
          <p className="type-caption m-0 text-fg-2">
            Cada página pode ter outro fundo depois, no menu “Mais opções” do editor.
          </p>
        </fieldset>
      )}

      <div className="flex flex-col gap-1 border-t border-line pt-4">
        <Button type="submit" disabled={busy}>
          {notebook ? "Salvar" : "Criar e abrir"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
