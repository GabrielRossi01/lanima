"use client";

import { Download, FileText, ListChecks } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { useFiles } from "@/features/files/queries";
import { useNotebookDocuments } from "@/features/notebook/documents";
import { useSubjects } from "@/features/subjects/queries";
import type { PdfQuestion } from "@/lib/study/pdf";
import { friendlyError } from "@/lib/supabase/errors";
import { exportPdf, longDate } from "./export-pdf";
import { useSummaries } from "./queries";
import { useQuestionBank, useTests, type Question } from "./test-queries";

/** A source's name without the extension, by reading (document) id. */
/** The name of a source: a file (without its extension) or a notebook page ("Aula 07 · pág. 2"). */
export function useSourceName(): (documentId: string) => string | null {
  const files = useFiles().data ?? [];
  const pages = useNotebookDocuments().data ?? [];
  return (documentId) =>
    files.find((f) => f.document?.id === documentId)?.name.replace(/\.[^.]+$/, "") ??
    pages.find((p) => p.id === documentId)?.name ??
    null;
}

const toPdf = (q: Question): PdfQuestion => ({
  id: q.id,
  type: q.type,
  difficulty: q.difficulty,
  topic: q.topic,
  statement: q.statement,
  options: q.options,
  answer: q.answer,
  explanation: q.explanation,
  source: q.source ? { documentId: q.source.documentId, page: q.source.page } : null,
});

const plural = (n: number) => (n === 1 ? "1 questão" : `${n} questões`);

/** "Exportar PDF" of a test (Resultado.html): its questions, the answer key apart if she wants. */
export function TestPdfSheet({
  open,
  onClose,
  title,
  subjectName,
  questions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subjectName: string | null;
  questions: readonly Question[];
}) {
  const fileName = useSourceName();
  const [answerKey, setAnswerKey] = useState(true);
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      await exportPdf(title, (pdf, fonts) =>
        pdf.testPdf(
          {
            title,
            meta: [subjectName, plural(questions.length), longDate(new Date())].filter(Boolean).join(" · "),
            questions: questions.map(toPdf),
            answerKey,
            fileName,
          },
          fonts,
        ),
      );
      onClose();
    } catch (error) {
      toast({ title: "Não foi possível exportar", description: friendlyError(error), tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Exportar em PDF"
      description={`${title} · ${plural(questions.length)}`}
      size="s"
      footer={
        <Button icon={Download} disabled={busy} onClick={() => void download()} className="w-full">
          {busy ? "Gerando o PDF…" : "Baixar PDF"}
        </Button>
      }
    >
      <Switch
        checked={answerKey}
        onChange={setAnswerKey}
        label="Gabarito separado no fim"
        description="As respostas e as explicações ficam nas últimas páginas, para imprimir e resolver antes."
      />
    </Sheet>
  );
}

/** "Resumos e testes em PDF" (Arquivos.html, Exportar): the chosen ones in a single PDF. */
export function StudyPdfSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const summaries = useSummaries().data ?? [];
  const tests = useTests().data ?? [];
  const bank = useQuestionBank().data ?? [];
  const subjects = useSubjects().data ?? [];
  const fileName = useSourceName();
  const [left, setLeft] = useState<Set<string>>(new Set());
  const [answerKey, setAnswerKey] = useState(true);
  const [busy, setBusy] = useState(false);
  const subjectName = (id: string | null) => subjects.find((s) => s.id === id)?.name ?? null;
  const chosen = (id: string) => !left.has(id);
  const toggle = (id: string) =>
    setLeft((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const pickedSummaries = summaries.filter((s) => chosen(s.id));
  const pickedTests = tests.filter((t) => chosen(t.id));
  const count = pickedSummaries.length + pickedTests.length;

  async function download() {
    setBusy(true);
    try {
      const byId = new Map(bank.map((q) => [q.id, q]));
      const today = longDate(new Date());
      await exportPdf("Resumos e testes", (pdf, fonts) =>
        pdf.studyPdf(
          {
            meta: `${count === 1 ? "1 item" : `${count} itens`} · ${today}`,
            summaries: pickedSummaries.map((s) => ({
              content: s.content,
              meta: [subjectName(s.subject_id), today].filter(Boolean).join(" · "),
            })),
            tests: pickedTests.map((t) => {
              const questions = t.question_ids.flatMap((id) => (byId.has(id) ? [toPdf(byId.get(id)!)] : []));
              return {
                title: t.title,
                meta: [subjectName(t.subject_id), plural(questions.length)].filter(Boolean).join(" · "),
                questions,
                answerKey,
              };
            }),
            fileName,
          },
          fonts,
        ),
      );
      onClose();
    } catch (error) {
      toast({ title: "Não foi possível exportar", description: friendlyError(error), tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  const row = (id: string, Icon: typeof FileText, title: string, meta: string) => (
    <li key={id}>
      <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-1 py-1.5 hover:bg-surface-alt">
        <input
          type="checkbox"
          checked={chosen(id)}
          onChange={() => toggle(id)}
          className="size-5 shrink-0 cursor-pointer accent-(--color-btn)"
        />
        <Icon aria-hidden size={18} strokeWidth={1.75} className="shrink-0 text-accent" />
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-medium wrap-break-word">{title}</span>
          <span className="text-xs text-fg-2">{meta}</span>
        </span>
      </label>
    </li>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Resumos e testes em PDF"
      description="Um PDF só, com cada resumo e cada teste em páginas próprias."
      size="m"
      footer={
        <Button icon={Download} disabled={busy || count === 0} onClick={() => void download()} className="w-full">
          {busy ? "Gerando o PDF…" : count === 0 ? "Escolha o que exportar" : `Baixar PDF (${count})`}
        </Button>
      }
    >
      {summaries.length + tests.length === 0 ? (
        <p className="type-body m-0 text-fg-2">Você ainda não tem resumos nem testes.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {summaries.length > 0 && (
            <section aria-label="Resumos" className="flex flex-col gap-1">
              <h3 className="type-overline m-0 text-fg-2">Resumos</h3>
              <ul className="m-0 list-none p-0">
                {summaries.map((s) => row(s.id, FileText, s.title, subjectName(s.subject_id) ?? "Sem matéria"))}
              </ul>
            </section>
          )}
          {tests.length > 0 && (
            <section aria-label="Testes" className="flex flex-col gap-1">
              <h3 className="type-overline m-0 text-fg-2">Testes</h3>
              <ul className="m-0 list-none p-0">
                {tests.map((t) =>
                  row(
                    t.id,
                    ListChecks,
                    t.title,
                    [subjectName(t.subject_id) ?? "Sem matéria", plural(t.question_ids.length)].join(" · "),
                  ),
                )}
              </ul>
            </section>
          )}
          {tests.length > 0 && (
            <Switch
              checked={answerKey}
              onChange={setAnswerKey}
              label="Gabarito no fim de cada teste"
              description="As respostas e as explicações, em páginas próprias."
            />
          )}
        </div>
      )}
    </Sheet>
  );
}
