"use client";

import { ArrowLeft, Mail } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { cleanOtpInput, isValidOtp } from "@/lib/auth/otp";
import { safeNextPath } from "@/lib/auth/redirect";
import { getSupabase } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";

const emailSchema = z.email({ error: "Confira o e-mail digitado." });

const RESEND_SECONDS = 60;

const LINK_ERRORS: Record<string, string> = {
  link: "Esse link expirou ou já foi usado. Peça um novo e-mail.",
  google: "Não foi possível entrar com o Google. Tente de novo.",
};

/** Google sign-in only shows up once it is configured in Supabase (see README). */
const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true";

export function SignInView() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("proxima"));
  const linkError = LINK_ERRORS[params.get("erro") ?? ""];

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>(linkError);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function sendEmail() {
    const parsed = emailSchema.safeParse(email.trim());
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError(undefined);
    const { error: otpError } = await getSupabase().auth.signInWithOtp({
      email: parsed.data,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (otpError) {
      setError(friendlyError(otpError, "Não foi possível enviar o e-mail. Tente de novo."));
      return;
    }
    setEmail(parsed.data);
    setStep("code");
    setCooldown(RESEND_SECONDS);
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    const token = cleanOtpInput(code);
    if (!isValidOtp(token)) {
      setError("Digite todos os números do código que chegou no e-mail.");
      return;
    }
    setBusy(true);
    setError(undefined);
    const { error: verifyError } = await getSupabase().auth.verifyOtp({ email, token, type: "email" });
    if (verifyError) {
      setBusy(false);
      setError(friendlyError(verifyError));
      return;
    }
    router.replace(next);
  }

  async function signInWithGoogle() {
    setBusy(true);
    setError(undefined);
    const redirectTo = `${window.location.origin}/callback?proxima=${encodeURIComponent(next)}`;
    const { error: oauthError } = await getSupabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (oauthError) {
      setBusy(false);
      setError(friendlyError(oauthError, LINK_ERRORS.google));
    }
  }

  if (step === "code") {
    return (
      <form onSubmit={verifyCode} aria-label="Confirmar código" className="flex max-w-md flex-col gap-5" noValidate>
        <div>
          <h1 className="type-page-title m-0">Confira seu e-mail</h1>
          <p className="type-body mt-2 mb-0 text-fg-2 wrap-anywhere">
            Enviamos um link e um código para <strong className="text-fg">{email}</strong>.
          </p>
        </div>
        <p className="m-0 rounded-lg bg-surface-alt px-4 py-3 text-sm leading-5 text-fg">
          Abra o link neste aparelho ou digite o código abaixo. No iPhone e no iPad com o app instalado, use o código.
        </p>
        <Field
          label="Código do e-mail"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(cleanOtpInput(e.target.value))}
          error={error}
          className="[&_input]:h-12 [&_input]:text-lg [&_input]:tracking-[4px]"
          autoFocus
        />
        <Button type="submit" disabled={busy}>
          {busy ? "Entrando…" : "Entrar"}
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="ghost"
            icon={ArrowLeft}
            onClick={() => {
              setStep("email");
              setCode("");
              setError(undefined);
            }}
          >
            Usar outro e-mail
          </Button>
          <Button variant="ghost" disabled={busy || cooldown > 0} onClick={sendEmail}>
            {cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar e-mail"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void sendEmail();
      }}
      aria-label="Entrar"
      className="flex max-w-md flex-col gap-5"
      noValidate
    >
      <div>
        <h1 className="type-page-title m-0">Entrar no Lanima</h1>
        <p className="type-body mt-2 mb-0 text-fg-2">
          Sem senha: você recebe um link e um código por e-mail. Na primeira vez, a conta é criada na hora.
        </p>
      </div>
      <Field
        label="E-mail"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="voce@exemplo.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={error}
        autoFocus
      />
      <Button type="submit" icon={Mail} disabled={busy}>
        {busy ? "Enviando…" : "Receber link e código"}
      </Button>
      {GOOGLE_ENABLED && (
        <>
          <div className="flex items-center gap-3 text-xs text-fg-2" aria-hidden>
            <span className="h-px flex-1 bg-line" />
            ou
            <span className="h-px flex-1 bg-line" />
          </div>
          <Button variant="secondary" onClick={signInWithGoogle} disabled={busy}>
            Entrar com o Google
          </Button>
        </>
      )}
    </form>
  );
}
