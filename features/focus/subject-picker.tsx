"use client";

import { BookOpen, Check, ChevronRight, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { useSubjects, useTopics } from "@/features/subjects/queries";
import { cn } from "@/lib/cn";
import { SUBJECT_BG } from "@/lib/subjects/colors";
import { subjectIcon } from "@/lib/subjects/icons";
import { sortTopics } from "@/lib/subjects/subjects";
import { useTimerStore } from "./timer-store";

function Glyph({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon size={16} strokeWidth={1.75} />;
}

const row =
  "flex min-h-11 w-full min-w-0 items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-fg hover:bg-surface-alt";

/** What she is studying: a subject and, optionally, one of its topics. */
export function SubjectPicker() {
  const subjectId = useTimerStore((s) => s.timer.subjectId);
  const topicId = useTimerStore((s) => s.timer.topicId);
  const act = useTimerStore((s) => s.act);
  const subjects = useSubjects().data ?? [];
  const topics = useTopics().data ?? [];
  const [open, setOpen] = useState(false);

  const subject = subjects.find((s) => s.id === subjectId);
  const topic = subject && topics.find((t) => t.id === topicId && t.subject_id === subject.id);
  const own = subject ? sortTopics(topics.filter((t) => t.subject_id === subject.id)) : [];

  const pick = (nextSubject: string | null, nextTopic: string | null) =>
    act((t) => ({ ...t, subjectId: nextSubject, topicId: nextTopic }));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 max-w-full min-w-0 items-center gap-2.5 rounded-full border border-[#3E5566] bg-night-800 pr-4 pl-2 text-sm font-semibold text-white"
      >
        <span
          aria-hidden
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full",
            subject ? cn(SUBJECT_BG[subject.color], "text-ink") : "bg-white/15 text-white",
          )}
        >
          <Glyph icon={subject ? subjectIcon(subject.icon) : BookOpen} />
        </span>
        <span className="min-w-0 truncate">
          {subject ? `${subject.name}${topic ? ` · ${topic.title}` : ""}` : "Escolher matéria"}
        </span>
        <ChevronRight aria-hidden size={16} strokeWidth={1.75} className="shrink-0" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="O que você vai estudar?" size="s">
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          <li>
            <button type="button" className={row} aria-pressed={!subject} onClick={() => pick(null, null)}>
              <span className="min-w-0 flex-1">Sem matéria</span>
              {!subject && <Check aria-hidden size={18} strokeWidth={2} />}
            </button>
          </li>
          {subjects
            .filter((s) => !s.archived || s.id === subjectId)
            .map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={row}
                  aria-pressed={s.id === subjectId}
                  onClick={() => pick(s.id, s.id === subjectId ? topicId : null)}
                >
                  <span aria-hidden className={cn("size-3 shrink-0 rounded-full", SUBJECT_BG[s.color])} />
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  {s.id === subjectId && <Check aria-hidden size={18} strokeWidth={2} />}
                </button>
              </li>
            ))}
        </ul>
        {subject && own.length > 0 && (
          <section aria-label="Tópico" className="mt-4">
            <h3 className="type-overline m-0 mb-1 px-3 text-fg-2">Tópico (opcional)</h3>
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {own.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className={row}
                    aria-pressed={t.id === topicId}
                    onClick={() => {
                      pick(subject.id, t.id === topicId ? null : t.id);
                      setOpen(false);
                    }}
                  >
                    <span className={cn("min-w-0 flex-1 truncate", t.done && "text-fg-2")}>{t.title}</span>
                    {t.id === topicId && <Check aria-hidden size={18} strokeWidth={2} />}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Sheet>
    </>
  );
}
