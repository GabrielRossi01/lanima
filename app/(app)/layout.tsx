import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AuthGate } from "@/features/auth/auth-gate";
import { FocusWatcher } from "@/features/focus/focus-watcher";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate area="app">
      <FocusWatcher />
      <AppShell>{children}</AppShell>
    </AuthGate>
  );
}
