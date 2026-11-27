"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { SelectField } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { useAuth } from "@/features/auth/auth-provider";
import { useFiles } from "@/features/files/queries";
import { useAssessments, useSubjects, useTopics } from "@/features/subjects/queries";
import { remainingLabel } from "@/lib/ai/messages";
import { DETAIL_LABELS, DETAILS, type Detail } from "@/lib/ai/schemas";
import { formatDate, todayIn } from "@/lib/dates/calendar";
import { sortTopics, upcomingAssessments } from "@/lib/subjects/subjects";
import { summariesKey, useAiRemaining } from "./queries";
import { useNotebookDocuments } from "@/features/notebook/documents";
import { NotebookPagesPicker } from "./notebook-pages-picker";
import { isUsable, SourcePicker } from "./source-picker";
import { AiFailureCard, AiProgress, useGenerate } from "./use-generate";

const DETAIL_HINTS: Record<Detail, string> = {
  curto: "Só os pontos-chave.",
  medio: "Os tópicos com os pontos principais.",
  completo: "Todo o conteúdo, com subtópicos.",
};

const ALL = "";

/**
 * "Novo resumo" (section 7.5): one or more files, the level of detail and an optional focus (a test
 * of the subject or a topic of its syllabus). Opens the summary when it is ready.
 */
export function NewSummarySheet({
  open,
  onClose,
  subjectId: initialSubject = null,
  fileIds = [],
  pageDocumentIds = [],
}: {
  open: boolean;
  onClose: () => void;
  subjectId?: string | null;
  fileIds?: readonly string[];
  /** Notebook pages already chosen ("Usar no resumo"): their readings. */
  pageDocumentIds?: readonly string[];
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const files = useFiles().data ?? [];
  const subjects = useSubjects().data ?? [];
  const topics = useTopics().data ?? [];
  const assessments = useAssessments().data ?? [];
  const remaining = useAiRemaining().data;
  const { run, progress, failure, notice } = useGenerate();

  const [subject, setSubject] = useState<string>(initialSubject ?? ALL);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(fileIds));
  const pages = useNotebookDocuments().data ?? [];
  const [selectedPages, setSelectedPages] = useState<Set<string>>(() => new Set(pageDocumentIds));
  const [detail, setDetail] = useState<Detail>("medio");
  const [focus, setFocus] = useState("");

  const visible = files.filter((f) => (subject === ALL ? true : f.subject_id === subject));
  const chosen = files.filter((f) => selected.has(f.id) && isUsable(f));
  const visiblePages = pages.filter((p) => subject === ALL || p.subjectId === subject || selectedPages.has(p.id));
  const chosenPages = pages.filter((p) => selectedPages.has(p.id) && p.ready);
  const today = todayIn(new Date());
  const focusOptions =
    subject === ALL
      ? []
      : [
          ...upcomingAssessments(
            assessments.filter((a) => a.subject_id === subject),
            today,
          ).map((a) => `Para a prova de ${formatDate(a.date).slice(0, 5)} (${a.title})`),
          ...sortTopics(topics.filter((t) => t.subject_id === subject)).map((t) => t.title),
        ];

  const flip = (set: ReadonlySet<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  const toggle = (id: string) => setSelected((set) => flip(set, id));
  const togglePage = (id: string) => setSelectedPages((set) => flip(set, id));

  async function generate() {
    const subjectOfFiles =
      chosen.find((f) => f.subject_id)?.subject_id ?? chosenPages.find((p) => p.subjectId)?.subjectId ?? null;
    const result = await run("/api/ai/resumo", {
      documentIds: [...chosen.map((f) => f.document!.id), ...chosenPages.map((p) => p.id)],
      detail,
      focus: focus || null,
      subjectId: subject === ALL ? subjectOfFiles : subject,
    });
    if (!result) return;
    await queryClient.invalidateQueries({ queryKey: summariesKey(user?.id) });
    onClose();
    router.push(`/estudo/resumo/${result.id}`);
  }

  const busy = progress !== null;
  const outOfQuota = remaining !== undefined && (remaining.summaries === 0 || !remaining.appOpen);

  return (
    <>
      <Sheet
        open={open}
        onClose={busy ? () => {} : onClose}
        title="Novo resumo"
        description="Um resumo em tópicos, com a página de cada ponto."
        size="l"
        footer={
          busy ? undefined : (
            <>
              {remaining && (
                <span className="mr-auto text-xs font-semibold text-accent">{remainingLabel(remaining.summaries)}</span>
              )}
              <Button variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                icon={Sparkles}
                disabled={chosen.length + chosenPages.length === 0 || outOfQuota}
                onClick={() => void generate()}
              >
                Gerar resumo
              </Button>
            </>
          )
        }
      >
        {busy ? (
          <AiProgress message={progress} />
        ) : (
          <div className="flex flex-col gap-5">
            {failure && <AiFailureCard failure={failure} />}
            {subjects.length > 0 && (
              <SelectField label="Matéria" value={subject} onChange={(e) => setSubject(e.target.value)}>
                <option value={ALL}>Todas as matérias</option>
                {subjects
                  .filter((s) => !s.archived)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </SelectField>
            )}
            <section className="flex flex-col gap-2.5" aria-labelledby="novo-resumo-arquivos">
              <div className="flex items-baseline justify-between gap-3">
                <h3 id="novo-resumo-arquivos" className="m-0 text-base font-semibold">
                  Arquivos
                </h3>
                <span className="text-xs text-fg-2">
                  {chosen.length === 1 ? "1 marcado" : `${chosen.length} marcados`}
                </span>
              </div>
              {visible.length === 0 ? (
                <div className="flex flex-col items-start gap-3 rounded-card border border-line bg-surface-alt p-4">
                  <p className="type-body m-0 text-fg-2">
                    Nenhum arquivo {subject === ALL ? "ainda" : "desta matéria"}. Envie slides, PDFs, Word ou fotos de
                    páginas de livro.
                  </p>
                  <Link href="/arquivos" className={buttonClasses("secondary", "s")}>
                    Enviar arquivos
                  </Link>
                </div>
              ) : (
                <SourcePicker files={visible} selected={selected} onToggle={toggle} label="Arquivos para resumir" />
              )}
            </section>
            {visiblePages.length > 0 && (
              <section className="flex flex-col gap-2.5" aria-labelledby="novo-resumo-caderno">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 id="novo-resumo-caderno" className="m-0 text-base font-semibold">
                    Páginas do caderno
                  </h3>
                  <span className="text-xs text-fg-2">
                    {chosenPages.length === 1 ? "1 marcada" : `${chosenPages.length} marcadas`}
                  </span>
                </div>
                <NotebookPagesPicker
                  pages={visiblePages}
                  selected={selectedPages}
                  onToggle={togglePage}
                  label="Páginas do caderno para resumir"
                />
                <p className="type-caption m-0 text-fg-2">
                  Entram as páginas enviadas com “Usar no resumo”: o texto das caixas e das fotos coladas.
                </p>
              </section>
            )}
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold">Nível de detalhe</span>
              <SegmentedControl
                label="Nível de detalhe"
                options={DETAILS.map((d) => ({ value: d, label: DETAIL_LABELS[d] }))}
                value={detail}
                onChange={setDetail}
              />
              <p className="type-caption m-0 text-fg-2">{DETAIL_HINTS[detail]}</p>
            </div>
            {focusOptions.length > 0 && (
              <SelectField label="Foco (opcional)" value={focus} onChange={(e) => setFocus(e.target.value)}>
                <option value="">Todo o conteúdo</option>
                {focusOptions.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </SelectField>
            )}
            {outOfQuota && <AiFailureCard failure={remaining?.appOpen === false ? "limite_app" : "limite"} />}
          </div>
        )}
      </Sheet>
      {notice}
    </>
  );
}
