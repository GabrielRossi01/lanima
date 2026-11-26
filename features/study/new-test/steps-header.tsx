import { Check, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/cn";

const STEPS = ["Conteúdo", "Configuração", "Questões"] as const;
const TITLES = ["Escolha o conteúdo", "Configure o teste", "Escolha as questões"] as const;

/** Header of the wizard (TesteConfig.html): back, "Novo teste · Matéria", title and the 3 steps. */
export function StepsHeader({
  step,
  subjectName,
  onBack,
}: {
  step: 1 | 2 | 3;
  subjectName: string | null;
  onBack: () => void;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label={step === 1 ? "Voltar para Resumos e testes" : `Voltar para ${STEPS[step - 2]}`}
          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-fg"
        >
          <ChevronLeft aria-hidden size={20} strokeWidth={1.75} />
        </button>
        <div className="min-w-0">
          <p className="m-0 text-[13px] text-fg-2">Novo teste{subjectName ? ` · ${subjectName}` : ""}</p>
          <h1 className="m-0 font-serif text-[28px] leading-9 font-semibold tracking-[-0.5px] max-md:text-2xl">
            {TITLES[step - 1]}
          </h1>
        </div>
      </div>
      <ol aria-label="Etapas" className="m-0 flex list-none items-center gap-2.5 p-0">
        {STEPS.map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const done = n < step;
          const current = n === step;
          return (
            <li key={label} className="flex items-center gap-2.5" aria-current={current ? "step" : undefined}>
              {i > 0 && (
                <span
                  aria-hidden
                  className={cn("h-0.5 w-10 rounded-full max-lg:w-5", n <= step ? "bg-btn" : "bg-line")}
                />
              )}
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-[13px] font-bold",
                  done || current ? "bg-btn text-white" : "bg-subtle text-fg-2",
                )}
              >
                {done ? <Check aria-label="concluída" size={14} strokeWidth={2.5} /> : n}
              </span>
              <span className={cn("text-sm", current ? "font-bold text-fg" : "font-medium text-fg-2 max-lg:sr-only")}>
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </header>
  );
}
