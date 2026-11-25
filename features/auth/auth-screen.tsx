import { Suspense } from "react";
import { AuthFrame } from "@/components/layout/auth-frame";
import type { AuthMode } from "@/lib/auth/pages";
import { cn } from "@/lib/cn";
import { AuthForm } from "./auth-form";
import { AuthGate } from "./auth-gate";

/** /entrar and /criar-conta (step 1 of 3): the same frame, with the content centered beside the panel. */
export function AuthScreen({ mode }: { mode: AuthMode }) {
  return (
    <AuthGate area="sign-in">
      <AuthFrame heroOnPhone>
        <div
          className={cn(
            "mx-auto flex w-full flex-1 flex-col py-2 md:justify-center md:py-4",
            mode === "entrar" ? "max-w-md" : "max-w-xl",
          )}
        >
          {/* useSearchParams (?proxima=, ?erro=) needs a Suspense boundary on a static page. */}
          <Suspense>
            <AuthForm mode={mode} />
          </Suspense>
        </div>
      </AuthFrame>
    </AuthGate>
  );
}
