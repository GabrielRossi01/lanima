"use client";

import {
  Archive,
  ArchiveRestore,
  BookOpen,
  ChevronRight,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  PersonStanding,
  Timer,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { IconTile } from "@/components/ui/icon-tile";
import { Sheet } from "@/components/ui/sheet";
import { TabList, TabPanel, Tabs } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { todayIn } from "@/lib/dates/calendar";
import { useNow } from "@/lib/hooks/use-now";
import { subjectIcon } from "@/lib/subjects/icons";
import { formatSchedule, rooms } from "@/lib/subjects/schedule";
import { summarize } from "@/lib/subjects/subjects";
import { errorTag, friendlyError } from "@/lib/supabase/errors";
import { RecentFiles, SubjectFilesTab } from "@/features/files/subject-files";
import { NotebookFormSheet } from "@/features/notebook/notebook-form-sheet";
import { RecentNotes, SubjectNotebooksTab } from "@/features/notebook/subject-notebooks";
import { LastTestCard } from "@/features/study/last-test-card";
import { SubjectStudyTab } from "@/features/study/study-view";
import { AssessmentList } from "./assessments";
import { ImportSyllabusSheet } from "./import-syllabus-sheet";
import { useAssessments, useDeleteSubject, useSetArchived, useSubjects, useTopics } from "./queries";
import { SubjectFormSheet } from "./subject-form-sheet";
import { TopicsChecklist } from "./topics-checklist";

const TABS = [
  { value: "visao", label: "Visão geral" },
  { value: "anotacoes", label: "Anotações" },
  { value: "estudo", label: "Resumos e testes" },
  { value: "arquivos", label: "Arquivos" },
  { value: "atlas", label: "Atlas 3D" },
  { value: "avaliacoes", label: "Avaliações" },
] as const;

function Later({ icon, title, phase }: { icon: typeof BookOpen; title: string; phase: number }) {
  return <EmptyState icon={icon} title={title} description={`Chega na fase ${phase} do Lanima.`} />;
}

/** Matéria (Materia.html): header, tabs, overview with syllabus checklist and assessments. */
export function SubjectDetailView({ id }: { id: string }) {
  const router = useRouter();
  const now = useNow();
  const subjects = useSubjects();
  const topics = useTopics();
  const assessments = useAssessments();
  const archive = useSetArchived();
  const remove = useDeleteSubject();
  const [tab, setTab] = useState<string>("visao");
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [creatingNote, setCreatingNote] = useState(false);

  const today = now ? todayIn(now) : null;
  const ready = subjects.data && topics.data && assessments.data && today;
  const failed = subjects.error ?? topics.error ?? assessments.error;

  if (!ready) {
    return failed ? (
      <Card>
        <p className="type-body m-0">Não foi possível carregar a matéria.</p>
        <p className="type-caption m-0 text-fg-2">matéria: {errorTag(failed)}</p>
      </Card>
    ) : (
      <div aria-busy className="flex flex-col gap-5">
        <div className="h-24 animate-pulse rounded-card bg-surface-alt motion-reduce:animate-none" />
        <div className="h-72 animate-pulse rounded-card bg-surface-alt motion-reduce:animate-none" />
      </div>
    );
  }

  const subject = subjects.data!.find((s) => s.id === id);
  if (!subject) {
    return (
      <EmptyState
        icon={BookOpen}
        title="Matéria não encontrada"
        description="Ela pode ter sido excluída."
        action={<ButtonLink href="/materias">Ver matérias</ButtonLink>}
      />
    );
  }

  const [summary] = summarize([subject], topics.data!, assessments.data!, today!);
  const own = assessments.data!.filter((a) => a.subject_id === subject.id);
  const schedule = formatSchedule(subject.schedule_slots);
  const meta = [schedule, ...rooms(subject.schedule_slots), `${summary.progress}% do conteúdo revisado`]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <nav aria-label="Trilha" className="mb-3 flex items-center gap-1 text-sm text-fg-2">
        <Link href="/materias" className="inline-flex min-h-11 items-center font-semibold">
          Matérias
        </Link>
        <ChevronRight aria-hidden size={16} strokeWidth={1.75} />
        <span aria-current="page" className="truncate">
          {subject.name}
        </span>
      </nav>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <IconTile icon={subjectIcon(subject.icon)} color={subject.color} size={64} />
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="type-page-title m-0 wrap-break-word">{subject.name}</h1>
            <p className="type-body m-0 wrap-break-word text-fg-2">{meta}</p>
            {subject.professor && <p className="type-caption m-0 text-fg-2">{subject.professor}</p>}
            {subject.archived && <p className="type-caption m-0 font-semibold text-warning-text">Arquivada</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink href={`/foco?materia=${subject.id}`} icon={Timer} variant="secondary">
            Estudar com foco
          </ButtonLink>
          <Button icon={NotebookPen} onClick={() => setCreatingNote(true)}>
            Nova nota
          </Button>
          <IconButton icon={MoreHorizontal} label="Opções da matéria" onClick={() => setMenuOpen(true)} />
        </div>
      </header>

      <Tabs value={tab} onChange={setTab}>
        <TabList label="Seções da matéria" tabs={TABS} className="mb-5" />

        <TabPanel value="visao">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-w-0 flex-col gap-5">
              <Card>
                <CardHeader
                  title="Conteúdo da matéria"
                  action={<span className="text-xs text-fg-2">plano de ensino</span>}
                />
                <TopicsChecklist subjectId={subject.id} topics={summary.topics} onImport={() => setImporting(true)} />
              </Card>
              <Card>
                <RecentNotes subjectId={subject.id} onSeeAll={() => setTab("anotacoes")} />
              </Card>
            </div>
            <div className="flex min-w-0 flex-col gap-5">
              <Card>
                <CardHeader
                  title="Avaliações"
                  action={
                    <Button variant="ghost" size="s" onClick={() => setTab("avaliacoes")}>
                      Ver todas
                    </Button>
                  }
                />
                <AssessmentList subjectId={subject.id} assessments={own} today={today!} compact />
              </Card>
              <LastTestCard subjectId={subject.id} />
              <Card>
                <RecentFiles subjectId={subject.id} onSeeAll={() => setTab("arquivos")} />
              </Card>
            </div>
          </div>
        </TabPanel>
        <TabPanel value="anotacoes">
          <SubjectNotebooksTab subjectId={subject.id} subjectName={subject.name} />
        </TabPanel>
        <TabPanel value="estudo">
          <SubjectStudyTab subjectId={subject.id} />
        </TabPanel>
        <TabPanel value="arquivos">
          <SubjectFilesTab subject={subject} subjects={subjects.data ?? []} />
        </TabPanel>
        <TabPanel value="atlas">
          <Later icon={PersonStanding} title="Atlas 3D" phase={10} />
        </TabPanel>
        <TabPanel value="avaliacoes">
          <Card className="max-w-3xl">
            <CardHeader title="Avaliações" />
            <AssessmentList subjectId={subject.id} assessments={own} today={today!} />
          </Card>
        </TabPanel>
      </Tabs>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Opções da matéria" size="s">
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {[
            {
              icon: Pencil,
              label: "Editar nome, cor e aulas",
              onClick: () => {
                setMenuOpen(false);
                setEditing(true);
              },
            },
            {
              icon: subject.archived ? ArchiveRestore : Archive,
              label: subject.archived ? "Desarquivar" : "Arquivar",
              onClick: () => {
                setMenuOpen(false);
                archive.mutate(
                  { id: subject.id, archived: !subject.archived },
                  {
                    onSuccess: () =>
                      toast({
                        title: subject.archived ? "Matéria desarquivada" : "Matéria arquivada",
                        tone: "success",
                      }),
                    onError: (error) =>
                      toast({ title: "Não foi possível salvar", description: friendlyError(error), tone: "danger" }),
                  },
                );
              },
            },
            {
              icon: Trash2,
              label: "Excluir matéria",
              onClick: () => {
                setMenuOpen(false);
                setDeleting(true);
              },
            },
          ].map(({ icon: Icon, label, onClick }) => (
            <li key={label}>
              <button
                type="button"
                onClick={onClick}
                className="flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-fg hover:bg-surface-alt"
              >
                <Icon aria-hidden size={20} strokeWidth={1.75} className="shrink-0 text-accent" />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <SubjectFormSheet open={editing} onClose={() => setEditing(false)} subject={subject} />
      <NotebookFormSheet open={creatingNote} onClose={() => setCreatingNote(false)} subjectId={subject.id} />
      <ImportSyllabusSheet
        open={importing}
        onClose={() => setImporting(false)}
        subjects={[subject]}
        subjectId={subject.id}
      />
      <ConfirmDialog
        open={deleting}
        title="Excluir matéria?"
        description={
          <>
            <strong className="text-fg">{subject.name}</strong> será excluída com o conteúdo do plano de ensino e as
            avaliações. As metas ligadas a ela continuam, sem matéria. Para só tirar da lista, use “Arquivar”.
          </>
        }
        confirmLabel="Excluir"
        danger
        busy={remove.isPending}
        onClose={() => setDeleting(false)}
        onConfirm={() =>
          remove.mutate(subject.id, {
            onSuccess: () => {
              toast({ title: "Matéria excluída", description: subject.name });
              router.replace("/materias");
            },
            onError: (error) =>
              toast({ title: "Não foi possível excluir", description: friendlyError(error), tone: "danger" }),
          })
        }
      />
    </>
  );
}
