import type { ReactNode } from "react";
import { AuthGate } from "@/features/auth/auth-gate";
import { FocusWatcher } from "@/features/focus/focus-watcher";

/** Full-screen screens (focus mode, later the notebook): signed-in only, no menu. */
export default function FullLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate area="app">
      <FocusWatcher />
      {children}
    </AuthGate>
  );
}
