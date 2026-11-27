import type { ReactNode } from "react";
import { AuthGate } from "@/features/auth/auth-gate";
import { FocusWatcher } from "@/features/focus/focus-watcher";
import { NotebookSyncWatcher } from "@/features/notebook/sync-watcher";

/** Full-screen screens (focus mode, taking a test, the notebook): signed-in only, no menu. */
export default function FullLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate area="app">
      <FocusWatcher />
      <NotebookSyncWatcher />
      {children}
    </AuthGate>
  );
}
