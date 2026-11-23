import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFrame } from "@/components/layout/auth-frame";
import { AuthGate } from "@/features/auth/auth-gate";
import { SignInView } from "@/features/auth/sign-in-view";

export const metadata: Metadata = { title: "Entrar" };

export default function Page() {
  return (
    <AuthGate area="sign-in">
      <AuthFrame heroOnPhone>
        <div className="flex flex-1 flex-col py-2 md:justify-center md:py-4">
          {/* useSearchParams (?proxima=, ?erro=) needs a Suspense boundary on a static page. */}
          <Suspense>
            <SignInView />
          </Suspense>
        </div>
      </AuthFrame>
    </AuthGate>
  );
}
