"use client";

import { Volume2 } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/cn";
import type { FocusPrefs } from "@/lib/focus/prefs";
import { FOCUS_THEME_LIST } from "./themes/registry";

interface SoundPickerProps {
  prefs: FocusPrefs;
  /** What is in effect on this device ("reduzir movimento" starts it off). */
  animation: boolean;
  onChange: (patch: Partial<FocusPrefs>) => void;
  onAnimationChange: (on: boolean) => void;
}

/** Volume, sounds and the background switch. Every target is at least 44 px. */
export function SoundPicker({ prefs, animation, onChange, onAnimationChange }: SoundPickerProps) {
  const volumeId = useId();
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-5 gap-y-2 lg:flex-nowrap lg:justify-end lg:gap-x-3 xl:gap-x-5">
      <label htmlFor={volumeId} className="flex min-h-11 items-center gap-2.5 text-(--focus-muted)">
        <Volume2 aria-hidden size={18} strokeWidth={1.75} className="shrink-0" />
        <span className="sr-only">Volume</span>
        <input
          id={volumeId}
          type="range"
          min={0}
          max={100}
          step={5}
          value={prefs.volume}
          aria-valuetext={`${prefs.volume}%`}
          onChange={(e) => onChange({ volume: Number(e.target.value) })}
          className="h-11 w-28 cursor-pointer touch-pan-y accent-(--focus-accent)"
        />
      </label>
      <div
        role="group"
        aria-label="Som e tema"
        className="order-last flex min-w-0 basis-full flex-wrap justify-center gap-1.5 lg:order-none lg:basis-auto lg:flex-nowrap"
      >
        {FOCUS_THEME_LIST.map((theme) => {
          const selected = theme.id === prefs.sound;
          return (
            <button
              key={theme.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange({ sound: theme.id })}
              className={cn(
                "inline-flex h-11 items-center rounded-full border px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-150",
                selected
                  ? "border-(--focus-accent) bg-(--focus-chip-bg) text-white"
                  : "border-(--focus-line) bg-transparent text-(--focus-muted)",
              )}
            >
              {theme.label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={animation}
        aria-label="Animação do fundo"
        title="Animação do fundo"
        onClick={() => onAnimationChange(!animation)}
        className="inline-flex h-11 w-12 shrink-0 items-center justify-center"
      >
        <span
          aria-hidden
          className={cn(
            "flex h-7 w-[46px] items-center rounded-full p-[3px] transition-colors duration-200",
            animation ? "bg-(--focus-accent)" : "bg-white/25",
          )}
        >
          <span
            className={cn(
              "size-[22px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.4)] transition-transform duration-200",
              animation && "translate-x-[18px]",
            )}
          />
        </span>
      </button>
    </div>
  );
}
