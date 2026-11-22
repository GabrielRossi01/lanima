import Link from "next/link";
import { CalendarClock, FileText, ListChecks, NotebookPen, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { SUBJECT_BG, type SubjectColor } from "@/lib/subjects/colors";
import { IconTile } from "./icon-tile";
import { ProgressBar } from "./progress-bar";

interface SubjectCardProps {
  href: string;
  name: string;
  color: SubjectColor;
  icon: LucideIcon;
  schedule?: string;
  /** e.g. "Prova em 14 dias" */
  nextAssessment?: string;
  /** % of syllabus topics done */
  progress: number;
  counts: { notes: number; summaries: number; files: number };
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function SubjectCard({ href, name, color, icon, schedule, nextAssessment, progress, counts }: SubjectCardProps) {
  return (
    <Link
      href={href}
      className="relative flex flex-col gap-3.5 overflow-hidden rounded-card border border-line bg-surface p-5 text-fg no-underline shadow-card transition-colors duration-150 hover:border-line-strong"
    >
      <div aria-hidden className={cn("absolute inset-x-0 top-0 h-1.5", SUBJECT_BG[color])} />
      <IconTile icon={icon} color={color} size={48} />
      <div className="flex flex-col gap-0.5">
        <span className="text-[17px] leading-6 font-semibold wrap-break-word">{name}</span>
        {schedule && <span className="text-[13px] wrap-break-word text-fg-2">{schedule}</span>}
      </div>
      {nextAssessment && (
        <span className="inline-flex h-[26px] items-center gap-1.5 self-start rounded-full bg-surface-alt px-2.5 text-xs font-semibold text-accent">
          <CalendarClock aria-hidden size={14} strokeWidth={1.75} />
          {nextAssessment}
        </span>
      )}
      <ProgressBar value={progress} label={`Progresso em ${name}`} showValue />
      <div className="flex flex-wrap gap-3.5 border-t border-subtle pt-3 text-xs text-fg-2">
        <span className="inline-flex items-center gap-1.5">
          <NotebookPen aria-hidden size={14} strokeWidth={1.75} />
          {plural(counts.notes, "nota", "notas")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ListChecks aria-hidden size={14} strokeWidth={1.75} />
          {plural(counts.summaries, "resumo", "resumos")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <FileText aria-hidden size={14} strokeWidth={1.75} />
          {plural(counts.files, "arquivo", "arquivos")}
        </span>
      </div>
    </Link>
  );
}
