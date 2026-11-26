"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { pageLabel } from "@/lib/extract/text";
import { friendlyError } from "@/lib/supabase/errors";
import { useChunks, useExcludePages, type StoredFile } from "./queries";

/** Long pages show this much until "Mostrar tudo". */
const PREVIEW_CHARS = 700;

function PageText({ text }: { text: string }) {
  const [all, setAll] = useState(false);
  const long = text.length > PREVIEW_CHARS;
  return (
    <>
      <p className="type-body m-0 whitespace-pre-wrap wrap-break-word text-fg">
        {all || !long ? text : `${text.slice(0, PREVIEW_CHARS).trimEnd()}…`}
      </p>
      {long && (
        <Button variant="ghost" size="s" className="self-start px-0" onClick={() => setAll(!all)}>
          {all ? "Mostrar menos" : "Mostrar tudo"}
        </Button>
      )}
    </>
  );
}

/**
 * The text read from a file, page by page (section 7.5, step 1). Pages can be left out of
 * summaries and tests (cover, references); the choice is saved on the reading.
 */
export function TextPreviewSheet({ file, onClose }: { file: StoredFile; onClose: () => void }) {
  const document = file.document;
  const chunks = useChunks(document?.id ?? null);
  const exclude = useExcludePages();
  const excluded = new Set(document?.excluded_pages ?? []);
  const approx = document?.pages_approx ?? false;

  const pages = new Map<number, string[]>();
  for (const chunk of chunks.data ?? []) pages.set(chunk.page, [...(pages.get(chunk.page) ?? []), chunk.text]);
  const used = [...pages.keys()].filter((p) => !excluded.has(p)).length;

  function toggle(page: number, use: boolean) {
    if (!document) return;
    const next = new Set(excluded);
    if (use) next.delete(page);
    else next.add(page);
    exclude.mutate(
      { documentId: document.id, pages: [...next].sort((a, b) => a - b) },
      {
        onError: (error) =>
          toast({ title: "Não foi possível salvar", description: friendlyError(error), tone: "danger" }),
      },
    );
  }

  const notes = [
    document?.page_count
      ? `${document.page_count} ${file.kind === "slides" ? "slides" : document.page_count === 1 ? "página" : "páginas"}`
      : null,
    pages.size > 0
      ? `${used} de ${pages.size} com texto ${used === 1 ? "usada" : "usadas"} nos resumos e testes`
      : null,
  ].filter(Boolean);

  return (
    <Sheet open onClose={onClose} title={`Texto de ${file.name}`} description={notes.join(" · ")} size="l">
      <div className="flex flex-col gap-4">
        {document?.used_ocr && (
          <p className="type-caption m-0 rounded-md bg-hl-yellow px-3 py-2 text-ink">
            Lido de imagem (OCR): confira nomes e números, pode haver erros.
          </p>
        )}
        {approx && (
          <p className="type-caption m-0 rounded-md bg-subtle px-3 py-2 text-fg-2">
            Este Word não guardou as páginas: elas são aproximadas (pág. ≈).
          </p>
        )}
        {chunks.isPending ? (
          <div aria-busy className="flex flex-col gap-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-card bg-surface-alt motion-reduce:animate-none" />
            ))}
          </div>
        ) : chunks.error ? (
          <div className="flex flex-col gap-2">
            <p className="type-body m-0">Não foi possível carregar o texto.</p>
            <Button variant="secondary" className="self-start" onClick={() => void chunks.refetch()}>
              Tentar de novo
            </Button>
          </div>
        ) : pages.size === 0 ? (
          <p className="type-body m-0 text-fg-2">Não há texto que dê para ler neste arquivo.</p>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {[...pages.entries()].map(([page, texts]) => {
              const label = pageLabel(page, { kind: file.kind, approx });
              const use = !excluded.has(page);
              return (
                <li
                  key={page}
                  aria-label={label}
                  className={`flex flex-col gap-2 rounded-card border border-line p-4 ${use ? "" : "opacity-60"}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="type-caption m-0 font-semibold uppercase tracking-wide text-fg-2">{label}</h3>
                    <Switch checked={use} onChange={(checked) => toggle(page, checked)} label="Usar nos resumos" />
                  </div>
                  <PageText text={texts.join("\n\n")} />
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Sheet>
  );
}
