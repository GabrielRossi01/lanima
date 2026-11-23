"use client";

import { ArrowDownToLine, Check, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { SubjectChip } from "@/components/ui/chip";
import { IconButton } from "@/components/ui/icon-button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { IsoDate } from "@/lib/dates/calendar";
import { goalWhen, isDone, overdueLabel, todayList, type GoalRow } from "@/lib/goals/goals";
import type { Subject } from "@/lib/subjects/subjects";
import { friendlyError } from "@/lib/supabase/errors";
import { GoalFormSheet } from "./goal-form-sheet";
import { useUpdateGoal } from "./queries";

function GoalItem({
  goal,
  subject,
  overdue,
  onEdit,
  onMoveToday,
}: {
  goal: GoalRow;
  subject?: Subject;
  overdue?: string;
  onEdit: () => void;
  onMoveToday?: () => void;
}) {
  const update = useUpdateGoal();
  const done = isDone(goal);
  const when = goalWhen(goal);
  const onError = (error: unknown) =>
    toast({ title: "Não foi possível salvar", description: friendlyError(error), tone: "danger" });
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-x-2 border-b border-subtle py-1.5 last:border-b-0">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={goal.title}
        onClick={() =>
          update.mutate({ id: goal.id, patch: { completed_at: done ? null : new Date().toISOString() } }, { onError })
        }
        className="flex size-11 shrink-0 items-center justify-center"
      >
        <span
          aria-hidden
          className={cn(
            "flex size-[26px] items-center justify-center rounded-sm border-[1.5px] transition-colors duration-150",
            done ? "border-btn bg-btn text-white" : "border-checkbox bg-surface",
          )}
        >
          {done && <Check size={16} strokeWidth={2.5} />}
        </span>
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1 py-1">
        <span className={cn("text-sm wrap-break-word", done ? "text-fg-2 line-through" : "text-fg")}>{goal.title}</span>
        <span className="flex flex-wrap items-center gap-2">
          {subject && (
            <SubjectChip color={subject.color} size="s">
              {subject.name}
            </SubjectChip>
          )}
          {overdue && <span className="text-xs font-semibold text-warning-text">{overdue}</span>}
        </span>
      </div>
      {when && <span className="shrink-0 text-xs font-semibold text-fg-2 tabular-nums">{when}</span>}
      <IconButton icon={Pencil} label={`Editar “${goal.title}”`} variant="ghost" onClick={onEdit} />
      {onMoveToday && !done && (
        <Button
          variant="ghost"
          size="s"
          icon={ArrowDownToLine}
          className="mb-1 ml-12 basis-full justify-start"
          onClick={onMoveToday}
        >
          Mover para hoje
        </Button>
      )}
    </li>
  );
}

interface GoalsCardProps {
  goals: readonly GoalRow[];
  subjects: readonly Subject[];
  today: IsoDate;
  className?: string;
}

/** "Metas de hoje": overdue goals on top (with "mover para hoje"), then today's checklist. */
export function GoalsCard({ goals, subjects, today, className }: GoalsCardProps) {
  const update = useUpdateGoal();
  const [editing, setEditing] = useState<GoalRow | undefined>();
  const [creating, setCreating] = useState(false);
  const { overdue, today: todays } = todayList(goals, today);
  const subjectOf = (id: string | null) => subjects.find((s) => s.id === id);

  return (
    <Card className={className}>
      <CardHeader
        title="Metas de hoje"
        action={
          <Button variant="ghost" size="s" icon={Plus} onClick={() => setCreating(true)}>
            Nova meta
          </Button>
        }
      />
      {overdue.length === 0 && todays.length === 0 ? (
        <p className="type-body m-0 text-fg-2">Nenhuma meta para hoje. Que tal planejar o que estudar?</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {overdue.map((goal) => (
            <GoalItem
              key={goal.id}
              goal={goal}
              subject={subjectOf(goal.subject_id)}
              overdue={overdueLabel(goal, today)}
              onEdit={() => setEditing(goal)}
              onMoveToday={() =>
                update.mutate(
                  { id: goal.id, patch: { date: today } },
                  {
                    onError: (error) =>
                      toast({ title: "Não foi possível mover", description: friendlyError(error), tone: "danger" }),
                  },
                )
              }
            />
          ))}
          {todays.map((goal) => (
            <GoalItem key={goal.id} goal={goal} subject={subjectOf(goal.subject_id)} onEdit={() => setEditing(goal)} />
          ))}
        </ul>
      )}
      <GoalFormSheet
        open={creating || editing !== undefined}
        onClose={() => {
          setCreating(false);
          setEditing(undefined);
        }}
        today={today}
        subjects={subjects}
        goal={editing}
      />
    </Card>
  );
}
