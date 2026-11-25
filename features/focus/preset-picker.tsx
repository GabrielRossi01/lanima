"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/cn";
import { BREAK_LIMITS, choosePreset, FOCUS_LIMITS, PRESETS, samePreset, type Preset } from "@/lib/focus/timer";
import { useTimerStore } from "./timer-store";

const pill =
  "inline-flex h-11 items-center rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors duration-150 disabled:opacity-50";

/** Durations. Only while the phase hasn't started: changing a running one would falsify it. */
export function PresetPicker() {
  const preset = useTimerStore((s) => s.timer.preset);
  const started = useTimerStore((s) => s.timer.startedAt !== null);
  const act = useTimerStore((s) => s.act);
  const [customizing, setCustomizing] = useState(false);
  const [draft, setDraft] = useState<Preset>(preset);
  const custom = !PRESETS.some((p) => samePreset(p, preset));

  const choose = (next: Preset) => act((t) => choosePreset(t, next));

  return (
    <div role="group" aria-label="Duração da sessão" className="flex flex-wrap justify-center gap-2">
      {PRESETS.map((p) => {
        const selected = samePreset(p, preset);
        return (
          <button
            key={p.focusMin}
            type="button"
            aria-pressed={selected}
            disabled={started}
            onClick={() => choose(p)}
            className={cn(
              pill,
              selected ? "border-white bg-white text-night-900" : "border-(--focus-line) text-(--focus-muted)",
            )}
          >
            {p.focusMin} / {p.breakMin} min
          </button>
        );
      })}
      <button
        type="button"
        aria-pressed={custom}
        disabled={started}
        onClick={() => {
          setDraft(preset);
          setCustomizing(true);
        }}
        className={cn(
          pill,
          custom ? "border-white bg-white text-night-900" : "border-dashed border-(--focus-line) text-(--focus-muted)",
        )}
      >
        {custom ? `${preset.focusMin} / ${preset.breakMin} min` : "Personalizar"}
      </button>
      <Sheet
        open={customizing}
        onClose={() => setCustomizing(false)}
        title="Personalizar a sessão"
        size="s"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCustomizing(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                choose(draft);
                setCustomizing(false);
              }}
            >
              Usar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Slider
            label="Foco"
            valueText={`${draft.focusMin} min`}
            value={draft.focusMin}
            min={FOCUS_LIMITS.min}
            max={FOCUS_LIMITS.max}
            step={5}
            onChange={(focusMin) => setDraft((d) => ({ ...d, focusMin }))}
          />
          <Slider
            label="Pausa"
            valueText={`${draft.breakMin} min`}
            value={draft.breakMin}
            min={BREAK_LIMITS.min}
            max={BREAK_LIMITS.max}
            step={1}
            onChange={(breakMin) => setDraft((d) => ({ ...d, breakMin }))}
          />
        </div>
      </Sheet>
    </div>
  );
}
