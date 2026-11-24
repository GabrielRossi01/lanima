import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { daysBetween, formatDate, weekdayOf, WEEKDAY_SHORT, type IsoDate } from "@/lib/dates/calendar";
import { SUBJECT_BG } from "@/lib/subjects/colors";
import {
  assessmentKindLabel,
  isExam,
  isTest,
  upcomingAssessments,
  type AssessmentRow,
  type Subject,
} from "@/lib/subjects/subjects";

/** Notes that fit on the board; the rest are counted below it. */
const BOARD_SIZE = 6;

function Note({ test, subject, today }: { test: AssessmentRow; subject: Subject; today: IsoDate }) {
  const n = daysBetween(today, test.date);
  const exam = isExam(test);
  return (
    <li className="flex min-w-0">
      <Link
        href={`/materias/${subject.id}`}
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-2 rounded-sm px-3.5 pt-3 pb-3.5 no-underline transition-transform duration-150 hover:-translate-y-0.5 motion-reduce:transform-none",
          exam ? "bg-exam text-white" : cn(SUBJECT_BG[subject.color], "text-ink"),
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold">
          {exam && <TriangleAlert aria-hidden size={14} strokeWidth={2} className="shrink-0" />}
          <span className="truncate">{assessmentKindLabel(test.kind)}</span>
        </span>
        <span className="font-serif text-[28px] leading-8 font-semibold">
          {n === 0 ? "hoje" : n === 1 ? "amanhã" : `${n} dias`}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-2 text-sm font-semibold wrap-break-word">{test.title}</span>
          <span className="line-clamp-2 text-xs wrap-break-word">{subject.name}</span>
        </span>
        <span className="text-xs tabular-nums">
          {WEEKDAY_SHORT[weekdayOf(test.date) - 1]}, {formatDate(test.date)}
        </span>
      </Link>
    </li>
  );
}

interface UpcomingTestsBoardProps {
  assessments: readonly AssessmentRow[];
  subjects: readonly Subject[];
  today: IsoDate;
}

/** "Próximas provas": a framed notice board, one note per test in its subject's color, exams in red. */
export function UpcomingTestsBoard({ assessments, subjects, today }: UpcomingTestsBoardProps) {
  const tests = upcomingAssessments(assessments, today).filter(isTest);
  const shown = tests.slice(0, BOARD_SIZE);
  const rest = tests.length - shown.length;
  return (
    <section
      aria-labelledby="proximas-provas"
      className="flex min-w-0 flex-col gap-4 rounded-card border-[6px] border-brand bg-deep p-4 shadow-card md:p-5"
    >
      <header className="flex items-baseline justify-between gap-3">
        <h2 id="proximas-provas" className="m-0 font-hand text-[32px] leading-9 font-semibold text-white">
          Próximas provas
        </h2>
        <Link href="/materias" className="shrink-0 text-sm font-semibold text-white">
          Matérias
        </Link>
      </header>
      {shown.length === 0 ? (
        <p className="type-body m-0 text-on-deep-2">
          Nenhuma prova marcada. Abra uma matéria e marque a data na aba Avaliações.
        </p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3 p-0">
          {shown.map((test) => {
            const subject = subjects.find((s) => s.id === test.subject_id);
            return subject && <Note key={test.id} test={test} subject={subject} today={today} />;
          })}
        </ul>
      )}
      {rest > 0 && (
        <p className="type-caption m-0 text-on-deep-2">
          {rest === 1 ? "Mais 1 prova marcada depois dessas." : `Mais ${rest} provas marcadas depois dessas.`}
        </p>
      )}
    </section>
  );
}
