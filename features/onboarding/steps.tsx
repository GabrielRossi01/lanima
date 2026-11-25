import { BookOpen, ListChecks, PenLine, Timer } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Step = 1 | 2 | 3;

/** "Passo 1 de 3": the same from /criar-conta (step 1) to the end of /boas-vindas. */
export function StepHeader({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[13px] font-semibold whitespace-nowrap text-accent">Passo {step} de 3</span>
      <div
        className="flex flex-1 gap-1.5"
        role="progressbar"
        aria-label="Progresso do cadastro"
        aria-valuemin={1}
        aria-valuemax={3}
        aria-valuenow={step}
      >
        {[1, 2, 3].map((n) => (
          <div key={n} className={cn("h-1 flex-1 rounded-full", n <= step ? "bg-brand" : "bg-subtle")} />
        ))}
      </div>
    </div>
  );
}

export function StepTitle({ title, subtitle }: { title: string; subtitle: ReactNode }) {
  return (
    <div>
      <h1 tabIndex={-1} className="type-page-title m-0 wrap-break-word">
        {title}
      </h1>
      <p className="mt-1 mb-0 text-[15px] leading-[22px] text-fg-2">{subtitle}</p>
    </div>
  );
}

const FEATURES = [
  { icon: BookOpen, text: "Matérias, metas do dia e provas num lugar só" },
  { icon: PenLine, text: "Caderno para escrever à mão com a S Pen ou o Apple Pencil" },
  { icon: ListChecks, text: "Resumos em tópicos e testes feitos a partir dos seus arquivos" },
  { icon: Timer, text: "Modo foco e ranking com o seu grupo de estudos" },
];

/** What the app does, in the first step. */
export function FeatureList({ className }: { className?: string }) {
  return (
    <ul className={cn("m-0 flex list-none flex-col gap-3 p-0", className)}>
      {FEATURES.map(({ icon: Icon, text }) => (
        <li key={text} className="flex items-center gap-3.5 rounded-lg bg-surface-alt p-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface text-accent">
            <Icon aria-hidden size={20} strokeWidth={1.75} />
          </span>
          <span className="type-body min-w-0">{text}</span>
        </li>
      ))}
    </ul>
  );
}
