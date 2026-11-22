"use client";

import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

export type ToastTone = "info" | "success" | "danger";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
  actions?: ToastAction[];
  /** ms; `0` keeps it until dismissed. Default 5000, or 8000 with actions. */
  duration: number;
}

type Listener = () => void;
let toasts: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const EMPTY: ToastItem[] = [];

function emit() {
  for (const l of listeners) l();
}

export function toast(
  input: Omit<ToastItem, "id" | "tone" | "duration"> & Partial<Pick<ToastItem, "tone" | "duration">>,
) {
  const item: ToastItem = {
    tone: "info",
    duration: input.actions?.length ? 8000 : 5000,
    ...input,
    id: nextId++,
  };
  // Keep at most 3 on screen.
  toasts = [...toasts, item].slice(-3);
  emit();
  return item.id;
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const icons = { info: Info, success: CircleCheck, danger: CircleAlert } as const;
const iconColor = { info: "text-accent", success: "text-success", danger: "text-danger" } as const;

function ToastView({ item }: { item: ToastItem }) {
  useEffect(() => {
    if (!item.duration) return;
    const timer = window.setTimeout(() => dismissToast(item.id), item.duration);
    return () => window.clearTimeout(timer);
  }, [item.id, item.duration]);

  const Icon = icons[item.tone];
  return (
    <li
      className={cn(
        "pointer-events-auto flex w-full items-start gap-3 rounded-lg border border-line bg-surface p-3.5 pr-2 text-fg shadow-float",
        "transition-[opacity,translate] duration-200 starting:translate-y-2 starting:opacity-0",
      )}
    >
      <Icon aria-hidden size={20} strokeWidth={1.75} className={cn("mt-0.5 shrink-0", iconColor[item.tone])} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="m-0 text-sm font-semibold wrap-anywhere">{item.title}</p>
        {item.description && <p className="type-caption m-0 wrap-anywhere text-fg-2">{item.description}</p>}
        {item.actions && (
          <div className="mt-1.5 flex flex-wrap gap-2">
            {item.actions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => {
                  action.onClick();
                  dismissToast(item.id);
                }}
                className="inline-flex h-10 items-center rounded-full border border-line-strong px-4 text-sm font-semibold text-accent hover:bg-surface-alt"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label="Dispensar aviso"
        onClick={() => dismissToast(item.id)}
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-fg-2 hover:bg-surface-alt hover:text-fg"
      >
        <X aria-hidden size={16} strokeWidth={1.75} />
      </button>
    </li>
  );
}

/** Mount once in the root layout. Sits above the phone tab bar. */
export function Toaster() {
  const items = useSyncExternalStore(
    subscribe,
    () => toasts,
    () => EMPTY,
  );
  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(88px+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-6 md:justify-end md:px-6"
    >
      <ol className="m-0 flex w-full max-w-[400px] list-none flex-col gap-2 p-0">
        {items.map((item) => (
          <ToastView key={item.id} item={item} />
        ))}
      </ol>
    </div>
  );
}
