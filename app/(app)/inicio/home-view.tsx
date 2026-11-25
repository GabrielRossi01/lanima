"use client";

import { BookOpen, Check, ChevronRight, Flame, Play, Target, Timer } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { MetricCard } from "@/components/ui/metric-card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { GoalsCard } from "@/features/goals/goals-card";
import { useGoals } from "@/features/goals/queries";
import { useProfile } from "@/features/profile/queries";
import { GlobalSearch } from "@/features/search/global-search";
import { useAssessments, useSubjects, useTopics } from "@/features/subjects/queries";
import { UpcomingTestsBoard } from "@/features/subjects/upcoming-tests-board";
import { cn } from "@/lib/cn";
import {
  addDays,
  daysBetween,
  formatDate,
  todayIn,
  weekdayOf,
  weekOf,
  WEEKDAY_SHORT,
  type IsoDate,
} from "@/lib/dates/calendar";
import { greetingFor, longDate } from "@/lib/dates/greeting";
import { weekProgress } from "@/lib/goals/goals";
import { useNow } from "@/lib/hooks/use-now";
import { FOCUS_GOAL, firstNameOf, formatFocusGoal } from "@/lib/profile/profile";
import { formatFocused } from "@/lib/focus/sessions";
import { useFocusSummary } from "@/features/focus/use-focus-summary";
import { SUBJECT_BG } from "@/lib/subjects/colors";
import { subjectIcon } from "@/lib/subjects/icons";
import { formatTimeShort } from "@/lib/subjects/schedule";
import {
  assessmentKindLabel,
  isCompleted,
  isExam,
  nextAssessment,
  recentSubjects,
  summarize,
  type AssessmentRow,
  type Subject,
  type SubjectSummary,
} from "@/lib/subjects/subjects";

function ContinueStudying({ recent }: { recent: SubjectSummary[] }) {
  return (
    <Card>
      <CardHeader
        title="Continuar estudando"
        action={
          <Link href="/materias" className="text-sm font-semibold">
            Todas as matérias
          </Link>
        }
      />
      {recent.length === 0 ? (
        <p className="type-body m-0 text-fg-2">
          Crie suas matérias em <Link href="/materias">Matérias</Link> para acompanhar o progresso aqui.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {recent.map(({ subject, topics, progress }) => {
            const nextTopic = topics.find((t) => !t.done);
            return (
              <li key={subject.id}>
                <Link
                  href={`/materias/${subject.id}`}
                  className="flex min-w-0 items-center gap-3.5 rounded-lg bg-surface-alt p-3 text-fg no-underline hover:bg-active"
                >
                  <IconTile icon={subjectIcon(subject.icon)} color={subject.color} size={40} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-semibold">{subject.name}</span>
                      <span className="truncate text-xs text-fg-2">
                        {nextTopic
                          ? nextTopic.title
                          : topics.length > 0
                            ? "Conteúdo todo revisado"
                            : "Sem conteúdo cadastrado"}
                      </span>
                    </span>
                    <ProgressBar value={progress} label={`Progresso em ${subject.name}`} showValue />
                  </span>
                  <ChevronRight aria-hidden size={18} strokeWidth={1.75} className="shrink-0 text-fg-2" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function NextExamCard({ exam, subject, today }: { exam?: AssessmentRow; subject?: Subject; today: IsoDate }) {
  if (!exam || !subject) {
    return (
      <Card tone="deep" className="gap-2.5">
        <span className="type-overline text-on-deep-2">Próxima prova</span>
        <span className="font-serif text-[28px] leading-9 font-semibold">Nenhuma marcada</span>
        <span className="type-body text-on-deep-2">Marque as avaliações na página de cada matéria.</span>
      </Card>
    );
  }
  const n = daysBetween(today, exam.date);
  const when = n === 0 ? "hoje" : n === 1 ? "amanhã" : `em ${n} dias`;
  const kind = assessmentKindLabel(exam.kind);
  return (
    <Card tone={isExam(exam) ? "exam" : "deep"} className="gap-2.5">
      <span className="font-serif text-[28px] leading-9 font-semibold wrap-break-word">
        {exam.kind === "prova" ? "Próxima prova" : kind} {when}
      </span>
      <span className="type-body wrap-break-word text-on-deep-2">
        {[subject.name, exam.title, exam.description].filter(Boolean).join(" · ")} · {formatDate(exam.date)}
      </span>
      <Button variant="inverse" disabled className="mt-1 self-start">
        Criar teste para a prova
      </Button>
      <span className="type-caption text-on-deep-2">Os testes chegam na fase 6.</span>
    </Card>
  );
}

/** Desktop.html "Semana": classes of the active subjects and this week's assessments, Mon–Sun. */
function WeekAgenda({
  subjects,
  assessments,
  today,
}: {
  subjects: Subject[];
  assessments: AssessmentRow[];
  today: IsoDate;
}) {
  const { start } = weekOf(today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const items = (day: IsoDate) => {
    const wd = weekdayOf(day);
    const classes = subjects.flatMap((s) =>
      s.schedule_slots
        .filter((slot) => slot.day === wd)
        .map((slot) => ({
          key: `${s.id}-${slot.start}`,
          sort: slot.start,
          label: `${s.name}${slot.lab ? " · lab" : ""}`,
          time: formatTimeShort(slot.start),
          color: s.color,
          exam: false,
          done: false,
        })),
    );
    const exams = assessments
      .filter((a) => a.date === day)
      .map((a) => {
        const s = subjects.find((x) => x.id === a.subject_id);
        return {
          key: a.id,
          sort: "00:00",
          label: `${a.title}${s ? ` · ${s.name}` : ""}`,
          time: assessmentKindLabel(a.kind).toLocaleLowerCase("pt-BR"),
          color: s?.color,
          exam: isExam(a) && !isCompleted(a),
          done: isCompleted(a),
        };
      });
    return [...exams, ...classes.sort((a, b) => a.sort.localeCompare(b.sort))];
  };
  const hasAny = days.some((d) => items(d).length > 0);
  if (!hasAny) return null;
  return (
    <Card className="hidden xl:flex">
      <CardHeader title="Semana" />
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {days.map((day, i) => {
          const list = items(day);
          if (list.length === 0) return null;
          return (
            <li key={day} className="flex gap-3">
              <span className={cn("w-12 shrink-0 text-xs font-semibold", day === today ? "text-accent" : "text-fg-2")}>
                {WEEKDAY_SHORT[i]} {Number(day.slice(8))}
              </span>
              <ul className="m-0 flex min-w-0 flex-1 list-none flex-col gap-1 p-0">
                {list.map((item) => (
                  <li key={item.key} className="flex min-w-0 items-center gap-2 text-xs">
                    <span
                      aria-hidden
                      className={cn("size-2 shrink-0 rounded-full", item.color ? SUBJECT_BG[item.color] : "bg-subtle")}
                    />
                    <span className={cn("min-w-0 flex-1 truncate", item.done && "text-fg-2 line-through")}>
                      {item.label}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 tabular-nums",
                        item.exam ? "font-semibold text-danger-text" : "text-fg-2",
                      )}
                    >
                      {item.time}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/** Início (Inicio.html, iPhoneInicio.html, Desktop.html). */
export function HomeView() {
  const now = useNow();
  const today = now ? todayIn(now) : null;
  const { data: profile } = useProfile();
  const subjects = useSubjects();
  const topics = useTopics();
  const assessments = useAssessments();
  const goals = useGoals(today);
  const firstName = firstNameOf(profile?.name);

  const active = (subjects.data ?? []).filter((s) => !s.archived);
  const activeIds = new Set(active.map((s) => s.id));
  const activeAssessments = (assessments.data ?? []).filter((a) => activeIds.has(a.subject_id));
  const summaries = today && topics.data ? summarize(active, topics.data, activeAssessments, today) : [];
  const exam = today ? nextAssessment(activeAssessments, today) : undefined;
  const focus = useFocusSummary(today);
  const goalMin = profile?.daily_focus_goal_min ?? FOCUS_GOAL.default;
  const goalReached = focus !== null && focus.minutes >= goalMin;
  const week = today && goals.data ? weekProgress(goals.data, today) : null;

  return (
    <>
      <PageHeader
        title={now ? (firstName ? `${greetingFor(now)}, ${firstName}` : `${greetingFor(now)}!`) : " "}
        subtitle={now ? longDate(now) : " "}
        actions={
          <>
            <GlobalSearch today={today} className="w-full md:w-72" />
            <ButtonLink href="/foco" icon={Play}>
              Iniciar foco
            </ButtonLink>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          icon={Timer}
          color={goalReached ? "verde" : "brand"}
          value={focus ? formatFocused(focus.minutes) : "–"}
          label={`Foco hoje · ${goalReached ? "meta do dia concluída" : `meta ${formatFocusGoal(goalMin)}`}`}
        />
        <MetricCard
          icon={Flame}
          color="amarelo"
          value={focus ? `${focus.streak} ${focus.streak === 1 ? "dia" : "dias"}` : "–"}
          label="Sequência de estudo"
        />
        <MetricCard
          icon={Check}
          color="verde"
          value={week ? `${week.done} de ${week.total}` : "–"}
          label="Metas da semana"
        />
        <MetricCard icon={Target} color="rosa" value="–" label="Acerto médio nos testes" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_290px] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          {today && goals.data ? (
            <GoalsCard goals={goals.data} subjects={subjects.data ?? []} today={today} />
          ) : (
            <div aria-busy className="h-48 animate-pulse rounded-card bg-surface-alt motion-reduce:animate-none" />
          )}
          {today && assessments.data && subjects.data ? (
            <UpcomingTestsBoard assessments={activeAssessments} subjects={active} today={today} />
          ) : (
            <div aria-busy className="h-48 animate-pulse rounded-card bg-surface-alt motion-reduce:animate-none" />
          )}
          {topics.data && subjects.data ? (
            <ContinueStudying recent={recentSubjects(summaries)} />
          ) : (
            <div aria-busy className="h-48 animate-pulse rounded-card bg-surface-alt motion-reduce:animate-none" />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader title="Ranking da semana" />
            <p className="type-body m-0 text-fg-2">Entre num grupo para ver o ranking da turma.</p>
          </Card>
          {today && <NextExamCard exam={exam} subject={active.find((s) => s.id === exam?.subject_id)} today={today} />}
          {today && <WeekAgenda subjects={active} assessments={activeAssessments} today={today} />}
          {subjects.data && active.length === 0 && (
            <Card tone="alt">
              <CardHeader title="Comece pelas matérias" />
              <p className="type-body m-0 text-fg-2">Cadastre as matérias e as aulas da semana.</p>
              <ButtonLink href="/materias" icon={BookOpen} variant="secondary" className="self-start">
                Abrir Matérias
              </ButtonLink>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
