"use client";

import { ArrowLeft, Mail, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { cleanOtpInput, isValidOtp } from "@/lib/auth/otp";
import { authPath, authProblemMessage, oauthCallbackUrl, type AuthMode } from "@/lib/auth/pages";
import { enabledProviders, PROVIDER_LABEL, PROVIDER_PARAMS, type SocialProvider } from "@/lib/auth/providers";
import { safeNextPath } from "@/lib/auth/redirect";
import { getSupabase } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/supabase/errors";
import { SocialButtons } from "./social-buttons";

const emailSchema = z.email({ error: "Confira o e-mail digitado." });

const RESEND_SECONDS = 60;

const PROVIDERS = enabledProviders(process.env.NEXT_PUBLIC_AUTH_PROVIDERS);

/** "e-mail" that never breaks at its hyphen. */
const EMAIL_WORD = <span className="whitespace-nowrap">e-mail</span>;

const COPY = {
  entrar: {
    title: "Entrar no Lanima",
    intro: <>Sem senha: use uma conta abaixo ou receba um link e um código por {EMAIL_WORD}.</>,
    emailOnlyIntro: <>Sem senha: você recebe um link e um código por {EMAIL_WORD}.</>,
    submit: "Receber link e código",
    confirm: "Entrar",
    confirming: "Entrando…",
    otherQuestion: "Ainda não tem conta?",
    otherMode: "criar-conta",
    otherLabel: "Criar conta",
  },
  "criar-conta": {
    title: "Criar conta no Lanima",
    intro: <>Sem senha: use uma conta abaixo ou confirme seu {EMAIL_WORD}. Depois é só montar seu perfil.</>,
    emailOnlyIntro: <>Sem senha: confirme seu {EMAIL_WORD} com um link ou código. Depois é só montar seu perfil.</>,
    submit: "Criar conta com e-mail",
    confirm: "Criar conta",
    confirming: "Criando…",
    otherQuestion: "Já tem conta?",
    otherMode: "entrar",
    otherLabel: "Entrar",
  },
} as const;

/** E-mail typed on one screen, carried to the other. In memory: never in the address or storage. */
let emailDraft = "";

/** Form of both screens: social buttons, e-mail, then the code that arrived. */
export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("proxima"));
  const copy = COPY[mode];

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(emailDraft);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  // From /callback (?erro=), until she tries again.
  const [problem, setProblem] = useState(() => authProblemMessage(params.get("erro"), params.get("provedor")));
  const [noAccount, setNoAccount] = useState(false);
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
    setNoAccount(false);
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
      options: { shouldCreateUser: mode === "criar-conta" },
    });
    setBusy(false);
    // Supabase's answer for an e-mail without account when it isn't allowed to create one.
    if (otpError?.code === "otp_disabled" && mode === "entrar") {
      setNoAccount(true);
      return;
    }
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
    const { error: verifyError } = await getSupabase().auth.verifyOtp({ email, token, type: "email" });
    if (verifyError) {
      setBusy(false);
      setError(friendlyError(verifyError));
      return;
    }
    emailDraft = "";
    router.replace(next);
  }

  async function continueWith(provider: SocialProvider) {
    start();
    const { error: oauthError } = await getSupabase().auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: oauthCallbackUrl(window.location.origin, mode, next, provider),
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
      className="flex max-w-md flex-col gap-5"
      noValidate
    >
      <div>
        <h1 className="type-page-title m-0">{copy.title}</h1>
        <p className="type-body mt-2 mb-0 text-fg-2">{PROVIDERS.length > 0 ? copy.intro : copy.emailOnlyIntro}</p>
      </div>
      {problem && (
        <p role="alert" className="m-0 rounded-lg bg-surface-alt px-4 py-3 text-sm leading-5 text-danger-text">
          {problem}
        </p>
      )}
      {PROVIDERS.length > 0 && (
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
        onChange={(e) => {
          setEmail(e.target.value);
          setNoAccount(false);
        }}
        error={error}
      />
      {noAccount && (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-lg bg-surface-alt px-4 py-3">
          <p className="m-0 text-sm leading-5 text-fg">Não achamos uma conta com esse e-mail. Confira ou crie uma.</p>
          <ButtonLink href={authPath("criar-conta", next)} variant="secondary" size="s" icon={UserPlus}>
            Criar conta com esse e-mail
          </ButtonLink>
        </div>
      )}
      <Button type="submit" icon={Mail} disabled={busy} className="h-12">
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
    </form>
  );
}
