import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { daysBetween, formatDate, weekdayOf, WEEKDAY_SHORT, type IsoDate } from "@/lib/dates/calendar";
import { SUBJECT_BG, type SubjectColor } from "@/lib/subjects/colors";
import {
  assessmentKindLabel,
  distinctColors,
  isExam,
  isTest,
  upcomingAssessments,
  type AssessmentRow,
  type Subject,
} from "@/lib/subjects/subjects";

/** Tests that fit in the card; the rest are counted below them. */
const BOARD_SIZE = 6;

interface TestCardProps {
  test: AssessmentRow;
  subject: Subject;
  color: SubjectColor;
  today: IsoDate;
}

function TestCard({ test, subject, color, today }: TestCardProps) {
  const n = daysBetween(today, test.date);
  const exam = isExam(test);
  return (
    <li className="flex min-w-0">
      <Link
        href={`/materias/${subject.id}`}
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-2 rounded-lg p-3.5 no-underline transition-transform duration-150 hover:-translate-y-0.5 motion-reduce:transform-none",
          exam ? "bg-exam text-white" : cn(SUBJECT_BG[color], "text-ink"),
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

/** "Próximas provas": one card per test, each in a color of its own; make-up exams are always red. */
export function UpcomingTestsBoard({ assessments, subjects, today }: UpcomingTestsBoardProps) {
  const subjectOf = new Map(subjects.map((s) => [s.id, s]));
  const tests = upcomingAssessments(assessments, today).filter((a) => isTest(a) && subjectOf.has(a.subject_id));
  const shown = tests.slice(0, BOARD_SIZE);
  const rest = tests.length - shown.length;
  const colors = distinctColors(
    shown.filter((t) => !isExam(t)).map((t) => ({ id: t.id, color: subjectOf.get(t.subject_id)!.color })),
  );
  return (
    <Card aria-label="Próximas provas">
      <CardHeader
        title="Próximas provas"
        action={
          <Link href="/materias" className="text-sm font-semibold">
            Todas as matérias
          </Link>
        }
      />
      {shown.length === 0 ? (
        <p className="type-body m-0 text-fg-2">
          Nenhuma prova marcada. Abra uma matéria e marque a data na aba Avaliações.
        </p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
          {shown.map((test) => {
            const subject = subjectOf.get(test.subject_id)!;
            return (
              <TestCard
                key={test.id}
                test={test}
                subject={subject}
                color={colors.get(test.id) ?? subject.color}
                today={today}
              />
            );
          })}
        </ul>
      )}
      {rest > 0 && (
        <p className="type-caption m-0 text-fg-2">
          {rest === 1 ? "Mais 1 prova marcada depois dessas." : `Mais ${rest} provas marcadas depois dessas.`}
        </p>
      )}
    </Card>
  );
}
