"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

interface CheckButtonProps {
  checked: boolean;
  label: string;
  onToggle: () => void;
}

/** Round-trip checkbox of the lists (goals, topics, assessments): 44 px target, 26 px box. */
export function CheckButton({ checked, label, onToggle }: CheckButtonProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className="flex size-11 shrink-0 items-center justify-center"
    >
      <span
        aria-hidden
        className={cn(
          "flex size-[26px] items-center justify-center rounded-sm border-[1.5px] transition-colors duration-150",
          checked ? "border-btn bg-btn text-white" : "border-checkbox bg-surface",
        )}
      >
        {checked && <Check size={16} strokeWidth={2.5} />}
      </span>
    </button>
  );
}
