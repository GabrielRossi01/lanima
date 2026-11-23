"use client";

import { Search, X } from "lucide-react";
import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-[13px] font-semibold text-fg", className)} {...props} />;
}

const fieldClasses =
  "h-11 w-full rounded-md border border-line-strong bg-surface px-3.5 text-sm text-fg placeholder:text-fg-2 transition-colors duration-150 focus-visible:border-brand aria-invalid:border-danger disabled:opacity-60";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldClasses, className)} {...props} />;
}

interface FieldProps extends Omit<ComponentProps<"input">, "id"> {
  label: string;
  hint?: ReactNode;
  error?: string;
}

/** Label + input + hint/error, wired with ids and aria-describedby. */
export function Field({ label, hint, error, className, ...props }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...props} />
      {error ? (
        <p id={`${id}-error`} className="type-caption m-0 text-danger-text">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="type-caption m-0 text-fg-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface SearchFieldProps extends Omit<ComponentProps<"input">, "type" | "onChange" | "value"> {
  label?: string;
  value: string;
  onValueChange: (value: string) => void;
}

export function SearchField({
  label = "Buscar",
  placeholder = "Buscar notas, resumos, arquivos…",
  value,
  onValueChange,
  className,
  ...props
}: SearchFieldProps) {
  return (
    <label
      className={cn(
        "flex h-11 items-center gap-2 rounded-full bg-subtle pl-4 pr-1.5 focus-within:outline-2 focus-within:outline-brand",
        className,
      )}
    >
      <Search aria-hidden size={18} strokeWidth={1.75} className="shrink-0 text-fg-2" />
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-2 [&::-webkit-search-cancel-button]:hidden"
        {...props}
      />
      {value && (
        <button
          type="button"
          aria-label="Limpar busca"
          onClick={() => onValueChange("")}
          className="inline-flex size-8 items-center justify-center rounded-full text-fg-2 hover:bg-surface hover:text-fg"
        >
          <X aria-hidden size={16} strokeWidth={1.75} />
        </button>
      )}
    </label>
  );
}

interface SelectFieldProps extends Omit<ComponentProps<"select">, "id"> {
  label: string;
  error?: string;
  children: ReactNode;
}

/** Native select (best picker on touch devices), styled like the text fields. */
export function SelectField({ label, error, className, children, ...props }: SelectFieldProps) {
  const id = useId();
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(fieldClasses, "appearance-none bg-[length:16px] bg-[right_14px_center] bg-no-repeat pr-10")}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2360676B' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        }}
        {...props}
      >
        {children}
      </select>
      {error && (
        <p id={`${id}-error`} className="type-caption m-0 text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
