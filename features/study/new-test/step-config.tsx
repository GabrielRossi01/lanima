"use client";

import { Check, FileText, ListChecks, Minus, Plus, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DifficultyBadge } from "@/components/ui/difficulty-badge";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { DIFFICULTIES, QUESTION_TYPE_LABELS, QUESTION_TYPES, type QuestionType } from "@/lib/ai/schemas";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/study/format";
import {
  configProblem,
  countsLabel,
  LEVEL_HINTS,
  MAX_PER_LEVEL,
  minutesLabel,
  TIME_LIMITS,
  total,
  type TestConfig,
} from "@/lib/study/test-config";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="m-0 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const MODES = [
  { value: "treino", label: "Treino", description: "Correção e explicação a cada questão" },
  { value: "prova", label: "Prova", description: "Resultado só no fim, com cronômetro" },
] as const;

const NO_LIMIT = "sem";

/** Step 2 (TesteConfig.html): levels with how many of each, types, mode and the summary of the test. */
export function StepConfig({
  config,
  onChange,
  sourceNames,
  topics,
  fromBank,
  toGenerate,
  proposal,
  remainingRuns,
  status,
  onGenerate,
  onBack,
}: {
  config: TestConfig;
  onChange: (config: TestConfig) => void;
  sourceNames: string[];
  topics: string[];
  fromBank: number;
  toGenerate: number;
  /** About 1.5× toGenerate: what the AI will suggest. */
  proposal: number;
  remainingRuns: number | undefined;
  status: ReactNode;
  onGenerate: () => void;
  onBack: () => void;
}) {
  const n = total(config.counts);
  const problem = configProblem(config);
  const setCount = (d: (typeof DIFFICULTIES)[number], value: number) =>
    onChange({ ...config, counts: { ...config.counts, [d]: Math.max(0, Math.min(MAX_PER_LEVEL, value)) } });
  const toggleType = (t: QuestionType) =>
    onChange({
      ...config,
      types: config.types.includes(t)
        ? config.types.filter((x) => x !== t)
        : QUESTION_TYPES.filter((x) => x === t || config.types.includes(x)),
    });

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <Section title="Níveis e quantidade">
          <div className="flex flex-col gap-2.5">
            {DIFFICULTIES.map((d) => (
              <div
                key={d}
                className="flex flex-wrap items-center gap-3.5 rounded-2xl border border-line bg-surface px-3.5 py-3 md:grid md:grid-cols-[auto_minmax(0,1fr)_auto]"
              >
                <DifficultyBadge level={d} />
                <span className="min-w-0 flex-[1_1_160px] text-[13px] leading-[18px] text-fg-2 md:flex-none">
                  {LEVEL_HINTS[d]}
                </span>
                <div
                  className="flex items-center gap-2"
                  role="group"
                  aria-label={`Questões de nível ${d === "facil" ? "fácil" : d === "medio" ? "médio" : "difícil"}`}
                >
                  <button
                    type="button"
                    aria-label="Menos questões"
                    disabled={config.counts[d] === 0}
                    onClick={() => setCount(d, config.counts[d] - 1)}
                    className="flex size-11 items-center justify-center rounded-full border border-line-strong bg-surface text-fg disabled:opacity-40"
                  >
                    <Minus aria-hidden size={18} strokeWidth={1.75} />
                  </button>
                  <span aria-live="polite" className="w-8 text-center font-serif text-2xl font-semibold tabular-nums">
                    {config.counts[d]}
                  </span>
                  <button
                    type="button"
                    aria-label="Mais questões"
                    disabled={config.counts[d] === MAX_PER_LEVEL}
                    onClick={() => setCount(d, config.counts[d] + 1)}
                    className="flex size-11 items-center justify-center rounded-full border border-line-strong bg-surface text-fg disabled:opacity-40"
                  >
                    <Plus aria-hidden size={18} strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Tipos de questão">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Tipos de questão">
            {QUESTION_TYPES.map((t) => {
              const on = config.types.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleType(t)}
                  className={cn(
                    "inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium",
                    on ? "border-btn bg-btn text-white" : "border-line-strong bg-surface text-fg",
                  )}
                >
                  {on && <Check aria-hidden size={16} strokeWidth={2.5} />}
                  {QUESTION_TYPE_LABELS[t]}
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="Modo">
          <div role="radiogroup" aria-label="Modo" className="flex gap-2.5 max-md:flex-col">
            {MODES.map((m) => {
              const on = config.mode === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() =>
                    onChange({
                      ...config,
                      mode: m.value,
                      timeLimitMin: m.value === "treino" ? null : config.timeLimitMin,
                    })
                  }
                  className={cn(
                    "flex flex-1 flex-col gap-0.5 rounded-2xl px-4 py-3.5 text-left",
                    on ? "border-[1.5px] border-brand bg-active" : "border border-line bg-surface",
                  )}
                >
                  <span className="text-[15px] font-semibold text-fg">{m.label}</span>
                  <span className="text-xs text-fg-2">{m.description}</span>
                </button>
              );
            })}
          </div>
          {config.mode === "prova" && (
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold">Cronômetro, em minutos</span>
              <SegmentedControl
                label="Cronômetro"
                options={[
                  { value: NO_LIMIT, label: "Sem" },
                  ...TIME_LIMITS.map((m) => ({ value: String(m), label: String(m) })),
                ]}
                value={config.timeLimitMin === null ? NO_LIMIT : String(config.timeLimitMin)}
                onChange={(v) => onChange({ ...config, timeLimitMin: v === NO_LIMIT ? null : Number(v) })}
              />
            </div>
          )}
        </Section>

        <ul className="m-0 grid list-none grid-cols-1 gap-x-6 p-0 md:grid-cols-2">
          <li>
            <Switch
              label="Embaralhar alternativas"
              checked={config.shuffle}
              onChange={(shuffle) => onChange({ ...config, shuffle })}
            />
          </li>
          <li>
            <Switch
              label="Usar questões do meu banco primeiro"
              checked={config.useBank}
              onChange={(useBank) => onChange({ ...config, useBank })}
            />
          </li>
        </ul>
      </div>

      <aside className="flex w-full shrink-0 flex-col gap-3.5 lg:sticky lg:top-4 lg:w-[290px]" aria-label="Seu teste">
        <section className="flex flex-col gap-2.5 rounded-card bg-deep p-5 text-white">
          <span className="text-[11px] font-semibold tracking-[1px] text-on-deep-2 uppercase">Seu teste</span>
          <span className="font-serif text-[44px] leading-[48px] font-semibold tabular-nums">
            {plural(n, "questão", "questões")}
          </span>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm text-on-deep-2 tabular-nums">
            <li>{countsLabel(config.counts) || "Nenhuma questão"}</li>
            <li>{plural(config.types.length, "tipo de questão", "tipos de questão")}</li>
            <li>
              Modo {config.mode === "treino" ? "Treino" : "Prova"} ·{" "}
              {config.mode === "prova" && config.timeLimitMin
                ? `${config.timeLimitMin} min`
                : minutesLabel(config.counts)}
            </li>
          </ul>
        </section>
        <section className="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-4 shadow-card">
          <span className="text-[13px] font-semibold">Conteúdo escolhido</span>
          <div className="flex flex-col gap-1.5">
            {sourceNames.map((name) => (
              <span
                key={name}
                className="inline-flex h-6 max-w-full items-center gap-1 self-start rounded-sm bg-surface-alt px-2 text-xs font-medium text-accent"
              >
                {name.startsWith("Resumo · ") ? (
                  <ListChecks aria-hidden size={13} strokeWidth={1.75} className="shrink-0" />
                ) : (
                  <FileText aria-hidden size={13} strokeWidth={1.75} className="shrink-0" />
                )}
                <span className="truncate">{name}</span>
              </span>
            ))}
          </div>
          {topics.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {topics.map((t) => (
                <span
                  key={t}
                  className="inline-flex h-6 items-center rounded-full bg-hl-sky px-2.5 text-xs font-medium text-ink"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </section>
        <p className="m-0 text-xs leading-4 text-fg-2">
          {problem
            ? problem
            : toGenerate === 0
              ? `Todas as ${n} questões vêm do seu banco: não usa gerações de hoje.`
              : `${fromBank > 0 ? `${plural(fromBank, "questão vem", "questões vêm")} do seu banco. ` : ""}A IA vai sugerir ${proposal} questões para você escolher as melhores. Usa 1 ${remainingRuns !== undefined ? `das ${remainingRuns} gerações` : "geração"} de hoje.`}
        </p>
        {status}
        <Button
          icon={Sparkles}
          disabled={problem !== null || (toGenerate > 0 && remainingRuns === 0)}
          onClick={onGenerate}
        >
          {toGenerate === 0 ? "Ver as questões" : "Gerar questões"}
        </Button>
        <Button variant="ghost" onClick={onBack}>
          Voltar ao conteúdo
        </Button>
      </aside>
    </div>
  );
}
