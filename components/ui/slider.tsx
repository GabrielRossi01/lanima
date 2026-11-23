"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SliderProps {
  label: string;
  /** Formatted current value shown next to the label, e.g. "2h". Also read by screen readers. */
  valueText: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  hint?: ReactNode;
  className?: string;
}

/** Native range input (keyboard, touch and pen work out of the box) with a 44 px touch area. */
export function Slider({ label, valueText, value, min, max, step, onChange, hint, className }: SliderProps) {
  const id = useId();
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <label htmlFor={id} className="text-[13px] font-semibold text-fg">
        {label}: <span className="text-accent">{valueText}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText}
        onChange={(e) => onChange(Number(e.target.value))}
        className="touch-pan-y h-11 w-full cursor-pointer accent-btn"
      />
      {hint && <p className="type-caption m-0 text-fg-2">{hint}</p>}
    </div>
  );
}
