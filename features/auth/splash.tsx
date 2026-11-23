import { Logo } from "@/components/ui/logo";

/** Shown for the instant it takes to read the session on the device. */
export function Splash() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-dvh items-center justify-center bg-bg">
      <Logo />
      <span className="sr-only">Carregando o Lanima…</span>
    </div>
  );
}
