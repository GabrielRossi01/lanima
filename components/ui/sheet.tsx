"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { IconButton } from "./icon-button";

export type SheetSide = "auto" | "bottom" | "center" | "left" | "right";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Visually hide the title (it stays as the accessible name). */
  hideTitle?: boolean;
  description?: ReactNode;
  /** `auto`: bottom sheet on phones, centered dialog from 768 px. */
  side?: SheetSide;
  size?: "s" | "m" | "l";
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

const panelBySide: Record<SheetSide, string> = {
  auto: cn(
    "mt-auto mb-0 w-full max-w-none rounded-t-xl pb-[max(20px,env(safe-area-inset-bottom))]",
    "md:m-auto md:w-[calc(100%-48px)] md:rounded-xl md:pb-6",
    "translate-y-0 starting:translate-y-8 md:starting:translate-y-2",
  ),
  bottom:
    "mt-auto mb-0 w-full max-w-none rounded-t-xl pb-[max(20px,env(safe-area-inset-bottom))] starting:translate-y-8",
  center: "m-auto w-[calc(100%-32px)] rounded-xl starting:translate-y-2",
  left: "mr-auto ml-0 h-dvh max-h-none w-[280px] max-w-[85vw] rounded-r-card starting:-translate-x-6",
  right: "ml-auto mr-0 h-dvh max-h-none w-[380px] max-w-[90vw] rounded-l-card starting:translate-x-6",
};

const maxWidth = { s: "md:max-w-[420px]", m: "md:max-w-[560px]", l: "md:max-w-[880px]" } as const;
const centerWidth = { s: "max-w-[420px]", m: "max-w-[560px]", l: "max-w-[880px]" } as const;

/**
 * Accessible modal built on the native <dialog> + showModal():
 * the rest of the page becomes inert (focus is trapped), Esc closes it,
 * and focus returns to the element that opened it.
 */
export function Sheet({
  open,
  onClose,
  title,
  hideTitle,
  description,
  side = "auto",
  size = "m",
  children,
  footer,
  className,
}: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      document.documentElement.style.overflow = "hidden";
    } else if (!open && dialog.open) {
      dialog.close();
    }
    return () => {
      // Route hidden by <Activity> or component unmounted while open.
      // The async "close" event may arrive after listeners are gone, so unlock scroll here too.
      if (dialog.open) {
        dialog.close();
        document.documentElement.style.overflow = "";
      }
    };
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => {
      document.documentElement.style.overflow = "";
      returnFocus.current?.focus?.();
      returnFocus.current = null;
      onCloseRef.current();
    };
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onCloseRef.current();
    };
    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("cancel", handleCancel);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("cancel", handleCancel);
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClick={(event) => {
        // A click on the ::backdrop targets the dialog element itself.
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        "max-h-[92dvh] overflow-hidden border border-line bg-surface p-0 text-fg shadow-float",
        "transition-[translate,opacity,display,overlay] transition-discrete duration-200 starting:opacity-0",
        "backdrop:transition-opacity backdrop:duration-200 starting:backdrop:opacity-0",
        panelBySide[side],
        side === "auto" && maxWidth[size],
        side === "center" && centerWidth[size],
        className,
      )}
    >
      {/* Only render content while open, so hidden sheets cost nothing. */}
      {open && (
        <div className="flex max-h-[inherit] flex-col">
          <header className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
            <div className="flex flex-col gap-1">
              <h2 id={titleId} className={cn("type-h1 m-0", hideTitle && "sr-only")}>
                {title}
              </h2>
              {description && (
                <p id={descId} className="type-body m-0 text-fg-2">
                  {description}
                </p>
              )}
            </div>
            <IconButton icon={X} label="Fechar" variant="ghost" onClick={onClose} className="-mr-2" />
          </header>
          <div className="touch-list min-h-0 flex-1 overflow-y-auto px-6 pb-4">{children}</div>
          {footer && (
            <footer className="flex flex-wrap justify-end gap-3 border-t border-line px-6 pt-4">{footer}</footer>
          )}
        </div>
      )}
    </dialog>
  );
}
