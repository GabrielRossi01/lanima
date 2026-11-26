"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-provider";
import { useFiles } from "@/features/files/queries";
import { useSubjects, useTopics } from "@/features/subjects/queries";
import { proposalCounts } from "@/lib/ai/generate";
import { QUESTION_TYPES } from "@/lib/ai/schemas";
import { formatDate, todayIn } from "@/lib/dates/calendar";
import { sortTopics } from "@/lib/subjects/subjects";
import {
  DEFAULT_CONFIG,
  initialSelection,
  matchingBank,
  moreCounts,
  plan,
  testOrder,
  topicKey,
  total,
  type Counts,
  type TestConfig,
} from "@/lib/study/test-config";
import { friendlyError } from "@/lib/supabase/errors";
import { useAiRemaining, useSummaries } from "../queries";
import { AiFailureCard, AiProgress, useGenerate } from "../use-generate";
import { isUsable } from "../source-picker";
import { fetchBatch, saveTest, setStatus, useQuestionBank, type Question } from "../test-queries";
import { QuestionEditor } from "./question-editor";
import { StepConfig } from "./step-config";
import { StepContent } from "./step-content";
import { StepQuestions } from "./step-questions";
import { StepsHeader } from "./steps-header";

/**
 * "Criar teste" (section 7.5): content, configuration and the choice of questions, on one page
 * (the mockups' layout). Opened from a subject (?materia=), a summary (?resumo=) or files (?arquivo=).
 */
export function NewTestWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const files = useFiles().data ?? [];
  const summaries = useSummaries().data ?? [];
  const subjects = (useSubjects().data ?? []).filter((s) => !s.archived);
  const syllabus = useTopics().data ?? [];
  const bank = useQuestionBank().data ?? [];
  const remaining = useAiRemaining().data;
  const { run, progress, failure, clearFailure, notice } = useGenerate();

  const fromSummary = summaries.find((s) => s.id === params.get("resumo"));
  const fromFiles = (params.get("arquivo") ?? "").split(",").filter(Boolean);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [subjectId, setSubjectId] = useState<string | null>(
    () => params.get("materia") ?? files.find((f) => fromFiles.includes(f.id))?.subject_id ?? null,
  );
  // The summary may arrive after the first render (list still loading): its subject wins then.
  const effectiveSubject = subjectId ?? fromSummary?.subject_id ?? null;
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(() => new Set(fromFiles));
  const [pickedSummaries, setPickedSummaries] = useState<Set<string> | null>(null);
  const selectedSummaries = pickedSummaries ?? new Set(fromSummary ? [fromSummary.id] : []);
  const [offTopics, setOffTopics] = useState<Set<string>>(new Set());
  const [config, setConfig] = useState<TestConfig>(DEFAULT_CONFIG);
  const [proposal, setProposal] = useState<Question[]>([]);
  const [bankIds, setBankIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Question | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const subject = subjects.find((s) => s.id === effectiveSubject) ?? null;
  const visibleFiles = files.filter(
    (f) => !effectiveSubject || f.subject_id === effectiveSubject || selectedFiles.has(f.id),
  );
  const visibleSummaries = summaries.filter(
    (s) => !effectiveSubject || s.subject_id === effectiveSubject || selectedSummaries.has(s.id),
  );
  const chosenFiles = visibleFiles.filter((f) => selectedFiles.has(f.id) && isUsable(f));
  const chosenSummaries = visibleSummaries.filter((s) => selectedSummaries.has(s.id));

  // Topics: those of the chosen summaries, then the subject's syllabus (without repeating).
  const topics = topicGroups();
  function topicGroups() {
    const seen = new Set<string>();
    const unique = (list: string[]) =>
      list.filter((t) => {
        const key = topicKey(t);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const fromSummaries = unique(chosenSummaries.flatMap((s) => s.content.topicos.map((t) => t.titulo)));
    const fromSyllabus = unique(
      effectiveSubject ? sortTopics(syllabus.filter((t) => t.subject_id === effectiveSubject)).map((t) => t.title) : [],
    );
    return { fromSummaries, fromSyllabus };
  }
  const chosenTopics = [...topics.fromSummaries, ...topics.fromSyllabus].filter((t) => !offTopics.has(topicKey(t)));

  const approved = bank.filter(
    (q) => q.status === "aprovada" && (!effectiveSubject || q.subject_id === effectiveSubject),
  );
  const configWithTopics = { ...config, topics: chosenTopics };
  const filled = plan(approved, configWithTopics);
  const toGenerate = total(filled.toGenerate);

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  function defaultTitle() {
    const base = chosenSummaries.length === 1 ? chosenSummaries[0].title : (subject?.name ?? "Teste");
    return `${base} · ${formatDate(todayIn(new Date())).slice(0, 5)}`;
  }

  const requestBody = (counts: Counts, extra?: { types?: TestConfig["types"]; topics?: string[] }) => ({
    documentIds: chosenFiles.map((f) => f.document!.id),
    summaryIds: chosenSummaries.map((s) => s.id),
    counts,
    types: extra?.types ?? config.types,
    topics: extra?.topics ?? chosenTopics,
    subjectId: effectiveSubject,
  });

  /** Step 2 → 3: the bank's questions, plus what the AI writes for the rest. */
  async function generate() {
    clearFailure();
    let generated: Question[] = [];
    if (toGenerate > 0) {
      const result = await run("/api/ai/questoes", requestBody(proposalCounts(filled.toGenerate) as Counts));
      if (!result) return;
      generated = await fetchBatch(result.id).catch((error) => {
        toast({ title: "Não foi possível carregar as questões", description: friendlyError(error), tone: "danger" });
        return [];
      });
      if (generated.length === 0) return;
    }
    const fromBank = filled.fromBank as Question[];
    setProposal([...fromBank, ...generated]);
    setBankIds(new Set(fromBank.map((q) => q.id)));
    setSelected(new Set([...fromBank.map((q) => q.id), ...initialSelection(generated, filled.toGenerate)]));
    setFlagged(new Set());
    if (!title) setTitle(defaultTitle());
    setStep(3);
  }

  /** "Gerar outra parecida": a new question of the same level, type and topic in its place. */
  async function swap(q: Question) {
    const result = await run("/api/ai/questoes", {
      ...requestBody({ facil: 0, medio: 0, dificil: 0, [q.difficulty]: 1 } as Counts, {
        types: [q.type],
        topics: [q.topic],
      }),
      fresh: true,
    });
    if (!result) return;
    const [fresh] = await fetchBatch(result.id);
    if (!fresh) return;
    await setStatus([q.id], "descartada").catch(() => {});
    setProposal((list) => list.map((x) => (x.id === q.id ? fresh : x)));
    setSelected((set) => {
      const next = new Set(set);
      if (next.delete(q.id)) next.add(fresh.id);
      return next;
    });
  }

  /** "Gerar mais 5": more to choose from, unselected. */
  async function more() {
    const result = await run("/api/ai/questoes", { ...requestBody(moreCounts(config.counts)), fresh: true });
    if (!result) return;
    const extra = await fetchBatch(result.id);
    setProposal((list) => [...list, ...extra.filter((q) => !list.some((x) => x.id === q.id))]);
  }

  async function flag(q: Question) {
    const isFlagged = flagged.has(q.id);
    try {
      await setStatus([q.id], isFlagged ? (bankIds.has(q.id) ? "aprovada" : "gerada") : "sinalizada");
      setFlagged((set) => toggle(set, q.id));
      if (!isFlagged) setSelected((set) => new Set([...set].filter((id) => id !== q.id)));
      void queryClient.invalidateQueries({ queryKey: ["study", "questions"] });
    } catch (error) {
      toast({ title: "Não foi possível sinalizar", description: friendlyError(error), tone: "danger" });
    }
  }

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      const chosen = proposal.filter((q) => selected.has(q.id) && !flagged.has(q.id));
      const discarded = proposal
        .filter((q) => !selected.has(q.id) && !flagged.has(q.id) && !bankIds.has(q.id))
        .map((q) => q.id);
      await saveTest({
        title: title.trim().slice(0, 200),
        subjectId: effectiveSubject,
        config: {
          ...configWithTopics,
          sources: {
            documentIds: chosenFiles.map((f) => f.document!.id),
            summaryIds: chosenSummaries.map((s) => s.id),
          },
        },
        questionIds: testOrder(chosen),
        discarded,
        queryClient,
        userId: user.id,
      });
      toast({ title: "Teste salvo", description: `${chosen.length} questões no seu banco.`, tone: "success" });
      router.push("/estudo");
    } catch (error) {
      toast({ title: "Não foi possível salvar o teste", description: friendlyError(error), tone: "danger" });
      setSaving(false);
    }
  }

  const status =
    progress !== null ? <AiProgress message={progress} /> : failure ? <AiFailureCard failure={failure} /> : null;
  const fileName = (documentId: string) =>
    files.find((f) => f.document?.id === documentId)?.name.replace(/\.[^.]+$/, "") ?? null;

  return (
    <>
      <StepsHeader
        step={step}
        subjectName={subject?.name ?? null}
        onBack={() => (step === 1 ? router.push("/estudo") : setStep((step - 1) as 1 | 2))}
      />
      {step === 1 && (
        <StepContent
          subjects={subjects}
          subjectId={effectiveSubject}
          onSubject={setSubjectId}
          files={visibleFiles}
          selectedFiles={selectedFiles}
          onToggleFile={(id) => setSelectedFiles((set) => toggle(set, id))}
          summaries={visibleSummaries}
          selectedSummaries={selectedSummaries}
          onToggleSummary={(id) => setPickedSummaries(toggle(selectedSummaries, id))}
          topics={topics}
          isTopicOn={(t) => !offTopics.has(topicKey(t))}
          onToggleTopic={(t) => setOffTopics((set) => toggle(set, topicKey(t)))}
          onToggleAllTopics={() => {
            const all = [...topics.fromSummaries, ...topics.fromSyllabus].map(topicKey);
            setOffTopics(chosenTopics.length === all.length ? new Set(all) : new Set());
          }}
          bankCount={matchingBank(approved, { topics: chosenTopics, types: [...QUESTION_TYPES] }).length}
          onNext={() => setStep(2)}
          onCancel={() => router.push("/estudo")}
        />
      )}
      {step === 2 && (
        <StepConfig
          config={config}
          onChange={setConfig}
          sourceNames={[...chosenFiles.map((f) => f.name), ...chosenSummaries.map((s) => `Resumo · ${s.title}`)]}
          topics={chosenTopics}
          fromBank={filled.fromBank.length}
          toGenerate={toGenerate}
          proposal={total(proposalCounts(filled.toGenerate) as Counts)}
          remainingRuns={remaining?.questionRuns}
          status={status}
          onGenerate={() => void generate()}
          onBack={() => setStep(1)}
        />
      )}
      {step === 3 && (
        <StepQuestions
          proposal={proposal}
          selected={selected}
          target={total(config.counts)}
          fromBank={bankIds}
          flagged={flagged}
          fileName={fileName}
          busy={progress !== null}
          status={status}
          title={title}
          onTitle={setTitle}
          onToggle={(id) => setSelected((set) => toggle(set, id))}
          onEdit={(q) => setEditing(q)}
          onWrite={() => setEditing("new")}
          onSwap={(q) => void swap(q)}
          onFlag={(q) => void flag(q)}
          onMore={() => void more()}
          onSave={() => void save()}
          saving={saving}
        />
      )}
      {editing && (
        <QuestionEditor
          question={editing === "new" ? null : editing}
          topic={chosenTopics[0] ?? subject?.name ?? ""}
          subjectId={effectiveSubject}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setProposal((list) =>
              list.some((q) => q.id === saved.id) ? list.map((q) => (q.id === saved.id ? saved : q)) : [...list, saved],
            );
            if (editing === "new") setSelected((set) => new Set(set).add(saved.id));
            setEditing(null);
          }}
        />
      )}
      {notice}
    </>
  );
}
