"use client";

import type { ReactNode } from "react";
import { Button } from "./button";
import { Sheet } from "./sheet";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** Red-toned confirm for destructive actions. */
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** "Are you sure?" for destructive actions; Esc or Cancelar closes without doing anything. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      side="center"
      size="s"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            onClick={onConfirm}
            disabled={busy}
            variant={danger ? "secondary" : "primary"}
            className={danger ? "border-danger text-danger-text hover:bg-surface-alt" : undefined}
          >
            {busy ? "Aguarde…" : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="type-body text-fg-2">{description}</div>
    </Sheet>
  );
}
