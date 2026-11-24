import { Suspense } from "react";
import { AuthFrame } from "@/components/layout/auth-frame";
import type { AuthMode } from "@/lib/auth/pages";
import { AuthForm } from "./auth-form";
import { AuthGate } from "./auth-gate";

/** /entrar and /criar-conta: the same frame, so the two can't drift apart. */
export function AuthScreen({ mode }: { mode: AuthMode }) {
  return (
    <AuthGate area="sign-in">
      <AuthFrame heroOnPhone>
        <div className="flex flex-1 flex-col py-2 md:justify-center md:py-4">
          {/* useSearchParams (?proxima=, ?erro=) needs a Suspense boundary on a static page. */}
          <Suspense>
            <AuthForm mode={mode} />
          </Suspense>
        </div>
      </AuthFrame>
    </AuthGate>
  );
}
