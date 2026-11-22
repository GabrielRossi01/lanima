import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Sem conexão" };

/** Served by the service worker when a page that was never visited is opened offline. */
export default function Offline() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <EmptyState
        icon={WifiOff}
        title="Você está sem internet"
        description="Esta tela ainda não foi aberta neste aparelho. As telas que você já usou continuam funcionando offline."
        className="max-w-md bg-surface"
      />
    </main>
  );
}
