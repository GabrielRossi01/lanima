"use client";

import { BookOpen, Camera, ChevronRight, ListChecks, PenLine, Plus, Timer, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { InstallSheet } from "@/components/layout/install-entry";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, SelectField } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { toast } from "@/components/ui/toast";
import { AvatarPicker } from "@/features/profile/avatar-picker";
import { useAvatarUrl, useProfile, useUpdateProfile } from "@/features/profile/queries";
import { useCreateSubjects } from "@/features/subjects/queries";
import { cn } from "@/lib/cn";
import {
  FOCUS_GOAL,
  formatFocusGoal,
  parseProfileDetails,
  SEMESTERS,
  semesterLabel,
  type ProfileDetailsErrors,
} from "@/lib/profile/profile";
import { useInstall } from "@/lib/pwa/use-install";
import { SUBJECT_BG } from "@/lib/subjects/colors";
import {
  colorForCustomSubject,
  CUSTOM_SUBJECT_ICON,
  normalizeSubjectName,
  subjectKey,
  SUGGESTED_SUBJECTS,
  type SubjectDraft,
} from "@/lib/subjects/suggestions";
import { friendlyError } from "@/lib/supabase/errors";

type Step = 1 | 2 | 3;

function StepHeader({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[13px] font-semibold whitespace-nowrap text-accent">Passo {step} de 3</span>
      <div
        className="flex flex-1 gap-1.5"
        role="progressbar"
        aria-label="Progresso do cadastro"
        aria-valuemin={1}
        aria-valuemax={3}
        aria-valuenow={step}
      >
        {[1, 2, 3].map((n) => (
          <div key={n} className={cn("h-1 flex-1 rounded-full", n <= step ? "bg-brand" : "bg-subtle")} />
        ))}
      </div>
    </div>
  );
}

function StepTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 tabIndex={-1} className="type-page-title m-0 wrap-break-word">
        {title}
      </h1>
      <p className="mt-1 mb-0 text-[15px] leading-[22px] text-fg-2">{subtitle}</p>
    </div>
  );
}

const FEATURES = [
  { icon: BookOpen, text: "Matérias, metas do dia e provas num lugar só" },
  { icon: PenLine, text: "Caderno para escrever à mão com a S Pen ou o Apple Pencil" },
  { icon: ListChecks, text: "Resumos em tópicos e testes feitos a partir dos seus arquivos" },
  { icon: Timer, text: "Modo foco e ranking com o seu grupo de estudos" },
];

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <>
      <StepTitle title="Que bom ter você aqui" subtitle="Em dois passos rápidos o Lanima fica com a sua cara." />
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {FEATURES.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-3.5 rounded-lg bg-surface-alt p-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface text-accent">
              <Icon aria-hidden size={20} strokeWidth={1.75} />
            </span>
            <span className="type-body min-w-0">{text}</span>
          </li>
        ))}
      </ul>
      <div className="flex-1" />
      <div className="flex justify-end">
        <Button icon={ChevronRight} iconPosition="end" onClick={onNext}>
          Começar
        </Button>
      </div>
    </>
  );
}

interface ProfileStepProps {
  onBack: () => void;
  onNext: () => void;
}

function ProfileStep({ onBack, onNext }: ProfileStepProps) {
  const { data: profile } = useProfile();
  const avatarUrl = useAvatarUrl(profile?.avatar_path).data;
  const update = useUpdateProfile();
  const createSubjects = useCreateSubjects();

  const [name, setName] = useState(profile?.name ?? "");
  const [semester, setSemester] = useState(profile?.semester ? String(profile.semester) : "");
  const [course, setCourse] = useState(profile?.course || "Biomedicina");
  const [institution, setInstitution] = useState(profile?.institution ?? "");
  const [errors, setErrors] = useState<ProfileDetailsErrors>({});

  const [chosen, setChosen] = useState<SubjectDraft[]>([]);
  const [custom, setCustom] = useState<SubjectDraft[]>([]);
  const [adding, setAdding] = useState(false);
  const [otherName, setOtherName] = useState("");
  const otherRef = useRef<HTMLInputElement>(null);
  const otherId = useId();

  useEffect(() => {
    if (adding) otherRef.current?.focus();
  }, [adding]);

  const isChosen = (draft: SubjectDraft) => chosen.some((c) => subjectKey(c.name) === subjectKey(draft.name));
  const toggle = (draft: SubjectDraft) =>
    setChosen((list) =>
      isChosen(draft) ? list.filter((c) => subjectKey(c.name) !== subjectKey(draft.name)) : [...list, draft],
    );

  function addOther() {
    const subjectName = normalizeSubjectName(otherName);
    if (!subjectName) {
      setAdding(false);
      return;
    }
    const all = [...SUGGESTED_SUBJECTS, ...custom];
    const existing = all.find((s) => subjectKey(s.name) === subjectKey(subjectName));
    const draft = existing ?? {
      name: subjectName.slice(0, 60),
      color: colorForCustomSubject(custom.length),
      icon: CUSTOM_SUBJECT_ICON,
    };
    if (!existing) setCustom((list) => [...list, draft]);
    if (!isChosen(draft)) setChosen((list) => [...list, draft]);
    setOtherName("");
    setAdding(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseProfileDetails({ name, semester, course, institution });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    try {
      await update.mutateAsync(parsed.data);
      await createSubjects.mutateAsync(chosen);
      onNext();
    } catch (error) {
      toast({ title: "Não foi possível salvar", description: friendlyError(error), tone: "danger" });
    }
  }

  const saving = update.isPending || createSubjects.isPending;
  const chips = [...SUGGESTED_SUBJECTS, ...custom];

  return (
    <form onSubmit={submit} aria-label="Criar perfil" className="flex flex-1 flex-col gap-[22px]" noValidate>
      <StepTitle title="Monte seu perfil" subtitle="Isso aparece para o seu grupo de estudos." />

      <AvatarPicker>
        {({ open, busy }) => (
          <div className="flex items-center gap-5">
            {avatarUrl ? (
              <Avatar size={96} src={avatarUrl} name={name || undefined} />
            ) : (
              <span
                aria-hidden
                className="flex size-24 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-[#9FB3C0] bg-surface-alt text-accent"
              >
                <Camera size={32} strokeWidth={1.75} />
              </span>
            )}
            <div className="flex min-w-0 flex-col gap-2">
              <Button variant="secondary" size="s" icon={Upload} onClick={open} disabled={busy}>
                {busy ? "Preparando…" : avatarUrl ? "Trocar foto" : "Adicionar foto"}
              </Button>
              <span className="type-caption text-fg-2">Câmera ou galeria · JPG ou PNG</span>
            </div>
          </div>
        )}
      </AvatarPicker>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
        <Field
          label="Como prefere que te chamem?"
          autoComplete="given-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          maxLength={60}
        />
        <SelectField
          label="Semestre"
          value={semester}
          onChange={(e) => setSemester(e.target.value)}
          error={errors.semester}
        >
          <option value="" disabled>
            Escolha
          </option>
          {SEMESTERS.map((n) => (
            <option key={n} value={n}>
              {semesterLabel(n)}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field
          label="Curso"
          value={course}
          onChange={(e) => setCourse(e.target.value)}
          error={errors.course}
          maxLength={80}
        />
        <Field
          label="Instituição"
          autoComplete="organization"
          placeholder="Sua faculdade"
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
          error={errors.institution}
          maxLength={120}
        />
      </div>

      <fieldset className="m-0 flex min-w-0 flex-col gap-2.5 border-0 p-0">
        <legend className="mb-2.5 p-0 text-[13px] font-semibold">Quais matérias você tem neste semestre?</legend>
        <div className="flex flex-wrap gap-2">
          {chips.map((draft) => {
            const on = isChosen(draft);
            return (
              <button
                key={draft.name}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(draft)}
                className={cn(
                  "inline-flex min-h-11 max-w-full items-center rounded-full border px-3.5 text-[13px] font-medium transition-colors duration-150",
                  on
                    ? cn(SUBJECT_BG[draft.color], "border-transparent text-ink")
                    : "border-line-strong bg-surface text-fg",
                )}
              >
                <span className="truncate">{draft.name}</span>
              </button>
            );
          })}
          {adding ? (
            <span className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line-strong bg-surface pr-1 pl-3.5">
              <label htmlFor={otherId} className="sr-only">
                Nome da matéria
              </label>
              <input
                id={otherId}
                ref={otherRef}
                value={otherName}
                maxLength={60}
                placeholder="Nome da matéria"
                onChange={(e) => setOtherName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addOther();
                  } else if (e.key === "Escape") {
                    setAdding(false);
                  }
                }}
                className="w-40 min-w-0 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-2"
              />
              <Button size="s" onClick={addOther}>
                Adicionar
              </Button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex min-h-11 items-center gap-1 rounded-full border border-dashed border-line-strong px-3.5 text-[13px] font-medium text-accent"
            >
              <Plus aria-hidden size={16} strokeWidth={1.75} />
              Outra
            </button>
          )}
        </div>
        <p className="type-caption m-0 text-fg-2">Dá para criar, editar e arquivar matérias depois, em Matérias.</p>
      </fieldset>

      <div className="flex-1" />
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack} disabled={saving}>
          Voltar
        </Button>
        <Button type="submit" icon={ChevronRight} iconPosition="end" disabled={saving}>
          {saving ? "Salvando…" : "Continuar"}
        </Button>
      </div>
    </form>
  );
}

const PRESETS = [60, 120, 180, 240];

function GoalStep({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const { mode, promptInstall } = useInstall();
  const [goal, setGoal] = useState(profile?.daily_focus_goal_min ?? FOCUS_GOAL.default);
  const [installOpen, setInstallOpen] = useState(false);

  async function finish() {
    try {
      await update.mutateAsync({ daily_focus_goal_min: goal, onboarding_completed_at: new Date().toISOString() });
    } catch (error) {
      toast({ title: "Não foi possível salvar", description: friendlyError(error), tone: "danger" });
      return;
    }
    // Section 7.1: offer the installation at the end of the onboarding, when it is possible:
    // the native prompt on Android, the step-by-step sheet on iOS.
    if (mode === "ios-manual" || mode === "ios-other-browser") {
      setInstallOpen(true);
      return;
    }
    if (mode === "prompt") await promptInstall();
    router.replace("/inicio");
  }

  return (
    <>
      <StepTitle
        title="Sua meta diária de foco"
        subtitle="Quanto tempo de estudo focado você quer fazer por dia? Dá para mudar quando quiser, no Perfil."
      />
      <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-card">
        <span className="font-serif text-[44px] leading-[52px] font-semibold text-accent">{formatFocusGoal(goal)}</span>
        <Slider
          label="Meta diária de foco"
          valueText={formatFocusGoal(goal)}
          value={goal}
          min={FOCUS_GOAL.min}
          max={FOCUS_GOAL.max}
          step={FOCUS_GOAL.step}
          onChange={setGoal}
          hint="De 30 minutos a 6 horas."
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Atalhos de meta">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={goal === p}
              onClick={() => setGoal(p)}
              className={cn(
                "inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors duration-150",
                goal === p ? "border-fg bg-fg text-bg" : "border-line-strong bg-surface text-fg",
              )}
            >
              {formatFocusGoal(p)}
            </button>
          ))}
        </div>
      </div>
      <p className="type-body m-0 text-fg-2">Códigos de grupo e ranking chegam numa próxima versão.</p>
      <div className="flex-1" />
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack} disabled={update.isPending}>
          Voltar
        </Button>
        <Button onClick={finish} disabled={update.isPending}>
          {update.isPending ? "Salvando…" : "Concluir"}
        </Button>
      </div>
      <InstallSheet
        open={installOpen}
        onClose={() => {
          setInstallOpen(false);
          router.replace("/inicio");
        }}
        otherBrowser={mode === "ios-other-browser"}
      />
    </>
  );
}

/** Onboarding (section 7.1): welcome, profile with subjects, daily goal; then the install sheet. */
export function OnboardingView({ step, onStepChange }: { step: Step; onStepChange: (step: Step) => void }) {
  const headingRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Move focus to the new step for keyboard and screen-reader users.
    headingRef.current?.querySelector<HTMLElement>("h1")?.focus();
  }, [step]);

  return (
    <div ref={headingRef} className="flex flex-1 flex-col gap-[22px] [&_h1]:outline-none">
      <StepHeader step={step} />
      {step === 1 && <WelcomeStep onNext={() => onStepChange(2)} />}
      {step === 2 && <ProfileStep onBack={() => onStepChange(1)} onNext={() => onStepChange(3)} />}
      {step === 3 && <GoalStep onBack={() => onStepChange(2)} />}
    </div>
  );
}
