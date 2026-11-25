"use client";

import { ArrowLeft, ChevronRight, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { FeatureList, StepHeader, StepTitle } from "@/features/onboarding/steps";
import { cleanOtpInput, isValidOtp } from "@/lib/auth/otp";
import { authPath, authProblemMessage, oauthCallbackUrl, type AuthMode } from "@/lib/auth/pages";
import { enabledProviders, PROVIDER_LABEL, PROVIDER_PARAMS, type SocialProvider } from "@/lib/auth/providers";
import { safeNextPath } from "@/lib/auth/redirect";
import { forgetSignUp, markSignUp } from "@/lib/auth/sign-up";
import { getSupabase } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import { SocialButtons } from "./social-buttons";

const emailSchema = z.email({ error: "Confira o e-mail digitado." });

const RESEND_SECONDS = 60;

/** Only to sign in: "Criar conta" goes through the steps. */
const PROVIDERS = enabledProviders(process.env.NEXT_PUBLIC_AUTH_PROVIDERS);

/** "e-mail" that never breaks at its hyphen. */
const EMAIL_WORD = <span className="whitespace-nowrap">e-mail</span>;

const COPY = {
  entrar: {
    title: "Entrar no Lanima",
    intro:
      PROVIDERS.length > 0 ? (
        <>Sem senha: use uma conta abaixo ou receba um link e um código por {EMAIL_WORD}.</>
      ) : (
        <>Sem senha: você recebe um link e um código por {EMAIL_WORD}.</>
      ),
    submit: "Receber link e código",
    confirm: "Entrar",
    confirming: "Entrando…",
    otherQuestion: "Ainda não tem conta?",
    otherMode: "criar-conta",
    otherLabel: "Criar conta",
  },
  "criar-conta": {
    title: "Criar conta no Lanima",
    intro: <>Em três passos rápidos o Lanima fica com a sua cara. Comece pelo seu {EMAIL_WORD}, sem senha.</>,
    submit: "Continuar",
    confirm: "Continuar",
    confirming: "Criando…",
    otherQuestion: "Já tem conta?",
    otherMode: "entrar",
    otherLabel: "Entrar",
  },
} as const;

/** The steps don't show for an account that already did them: say why. */
async function noticeExistingAccount(userId: string) {
  const { data } = await getSupabase().from("profiles").select("onboarding_completed_at").eq("id", userId).single();
  if (!data?.onboarding_completed_at) return;
  forgetSignUp();
  toast({ title: "Você já tinha uma conta", description: "Entramos nela com esse e-mail." });
}

/** E-mail typed on one screen, carried to the other. In memory: never in the address or storage. */
let emailDraft = "";

/**
 * Form of both screens: e-mail, then the code that arrived. Entrar also has the social buttons;
 * Criar conta is step 1 of 3 and goes on to the onboarding.
 */
export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("proxima"));
  const copy = COPY[mode];
  const creating = mode === "criar-conta";
  const stepHeader = creating && <StepHeader step={1} />;

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(emailDraft);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  // From /callback (?erro=), until she tries again.
  const [problem, setProblem] = useState(() => authProblemMessage(params.get("erro"), params.get("provedor")));
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  // Back from the provider's page: the browser may restore this one as it was left, still busy.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  function start() {
    setBusy(true);
    setError(undefined);
    setProblem(undefined);
  }

  async function sendEmail() {
    const parsed = emailSchema.safeParse(email.trim());
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    start();
    emailDraft = parsed.data;
    const { error: otpError } = await getSupabase().auth.signInWithOtp({
      email: parsed.data,
      // On both screens: an e-mail without account gets one, and no answer tells whether it had one.
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
    start();
    // Before the request: signing in is what moves on to the onboarding.
    if (creating) markSignUp();
    const { data, error: verifyError } = await getSupabase().auth.verifyOtp({ email, token, type: "email" });
    if (verifyError) {
      forgetSignUp();
      setBusy(false);
      setError(friendlyError(verifyError));
      return;
    }
    emailDraft = "";
    router.replace(next);
    if (creating && data.user) void noticeExistingAccount(data.user.id);
  }

  async function continueWith(provider: SocialProvider) {
    start();
    const { error: oauthError } = await getSupabase().auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: oauthCallbackUrl(window.location.origin, next, provider),
        queryParams: PROVIDER_PARAMS[provider],
      },
    });
    if (oauthError) {
      setBusy(false);
      setProblem(
        friendlyError(oauthError, `Não foi possível entrar com o ${PROVIDER_LABEL[provider]}. Tente de novo.`),
      );
    }
  }

  if (step === "code") {
    return (
      <form onSubmit={verifyCode} aria-label="Confirmar código" className="flex flex-col gap-5" noValidate>
        {stepHeader}
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
          {busy ? copy.confirming : copy.confirm}
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
      aria-label={copy.title}
      className="flex flex-col gap-5"
      noValidate
    >
      {stepHeader}
      <StepTitle title={copy.title} subtitle={copy.intro} />
      {problem && (
        <p role="alert" className="m-0 rounded-lg bg-surface-alt px-4 py-3 text-sm leading-5 text-danger-text">
          {problem}
        </p>
      )}
      {!creating && PROVIDERS.length > 0 && (
        <>
          <SocialButtons providers={PROVIDERS} disabled={busy} onPick={(p) => void continueWith(p)} />
          <div className="flex items-center gap-3 text-xs text-fg-2">
            <span aria-hidden className="h-px flex-1 bg-line" />
            ou com e-mail
            <span aria-hidden className="h-px flex-1 bg-line" />
          </div>
        </>
      )}
      <Field
        label="E-mail"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="voce@exemplo.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={error}
      />
      <Button
        type="submit"
        icon={creating ? ChevronRight : Mail}
        iconPosition={creating ? "end" : "start"}
        disabled={busy}
        className="h-12"
      >
        {busy ? "Enviando…" : copy.submit}
      </Button>
      <p className="m-0 text-center text-sm text-fg-2">
        {copy.otherQuestion}{" "}
        <Link
          href={authPath(copy.otherMode, next)}
          onClick={() => {
            emailDraft = email.trim();
          }}
          className="inline-flex min-h-11 items-center px-1 font-semibold"
        >
          {copy.otherLabel}
        </Link>
      </p>
      {creating && <FeatureList className="xl:grid xl:grid-cols-2" />}
    </form>
  );
}
