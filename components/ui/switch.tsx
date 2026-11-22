"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

/** Labelled switch row. The whole row is a 44 px+ touch target. */
export function Switch({ checked, onChange, label, description, disabled, className }: SwitchProps) {
  const id = useId();
  return (
    <div className={cn("flex min-h-11 items-center justify-between gap-4", className)}>
      <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer flex-col wrap-break-word">
        <span className="text-sm font-medium text-fg">{label}</span>
        {description && <span className="text-xs text-fg-2">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-200",
          // 44 px hit area around the 28 px track.
          "before:absolute before:-inset-2 before:content-['']",
          checked ? "border-btn bg-btn" : "border-line-strong bg-subtle",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "inline-block size-5 rounded-full bg-white shadow-card transition-transform duration-200",
            checked ? "translate-x-[22px]" : "translate-x-[3px]",
          )}
        />
      </button>
    </div>
  );
}
