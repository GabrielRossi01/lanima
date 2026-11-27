import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AuthGate } from "@/features/auth/auth-gate";
import { FocusWatcher } from "@/features/focus/focus-watcher";
import { NotebookSyncWatcher } from "@/features/notebook/sync-watcher";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate area="app">
      <FocusWatcher />
      <NotebookSyncWatcher />
      <AppShell>{children}</AppShell>
    </AuthGate>
  );
}
