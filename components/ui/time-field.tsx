"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";
import { completeTime, maskTime, parseTime } from "@/lib/dates/time";
import { Input, Label } from "./input";

interface TimeFieldProps {
  label: string;
  /** "HH:MM", or "" while there is no valid time. */
  value: string;
  onValueChange: (value: string) => void;
  error?: string;
  className?: string;
}

/**
 * Time of day in 24 hours, typed. Not `<input type="time">`: that one shows AM/PM when the browser
 * or system is in English, and the page can't change it.
 */
export function TimeField({ label, value, onValueChange, error, className }: TimeFieldProps) {
  const id = useId();
  const [text, setText] = useState(value);
  const [lastValue, setLastValue] = useState(value);

  // Changed from outside (not by typing here): rewrite the text.
  if (value !== lastValue) {
    setLastValue(value);
    if ((parseTime(text) ?? "") !== value) setText(value);
  }

  // Reported on saving, and gone as soon as the time is valid (same as DateField).
  const message = error && !parseTime(text) ? error : undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        placeholder="hh:mm"
        value={text}
        onChange={(e) => {
          const next = maskTime(e.target.value);
          setText(next);
          onValueChange(parseTime(next) ?? "");
        }}
        onFocus={(e) => e.target.select()}
        onBlur={() => {
          const time = completeTime(text);
          if (!time) return;
          setText(time);
          if (time !== value) onValueChange(time);
        }}
        aria-invalid={message ? true : undefined}
        aria-describedby={message ? `${id}-error` : undefined}
        className="tabular-nums"
      />
      {message && (
        <p id={`${id}-error`} className="type-caption m-0 text-danger-text">
          {message}
        </p>
      )}
    </div>
  );
}
