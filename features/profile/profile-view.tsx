"use client";

import { Camera, LogOut } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ThemePicker } from "@/components/layout/theme-picker";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, SelectField } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-provider";
import {
  FOCUS_GOAL,
  formatFocusGoal,
  parseProfileDetails,
  profileSubtitle,
  SEMESTERS,
  semesterLabel,
  type Profile,
  type ProfileDetailsErrors,
} from "@/lib/profile/profile";
import { friendlyError } from "@/lib/supabase/errors";
import { AvatarPicker } from "./avatar-picker";
import { useAvatarUrl, useProfile, useUpdateProfile } from "./queries";

function detailsOf(profile: Profile) {
  return {
    name: profile.name,
    course: profile.course,
    institution: profile.institution,
    semester: profile.semester ? String(profile.semester) : "",
    goal: profile.daily_focus_goal_min,
  };
}

function ProfileForm({ profile }: { profile: Profile }) {
  const update = useUpdateProfile();
  const avatarUrl = useAvatarUrl(profile.avatar_path).data;
  const [form, setForm] = useState(() => detailsOf(profile));
  const [errors, setErrors] = useState<ProfileDetailsErrors>({});

  // A newer copy from the server (or another device) refreshes the form, unless she has unsaved edits.
  const saved = detailsOf(profile);
  const savedKey = JSON.stringify(saved);
  const [lastSavedKey, setLastSavedKey] = useState(savedKey);
  if (savedKey !== lastSavedKey) {
    setLastSavedKey(savedKey);
    if (JSON.stringify(form) === lastSavedKey) setForm(saved);
  }
  const dirty = JSON.stringify(form) !== savedKey;

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseProfileDetails(form);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    try {
      await update.mutateAsync({ ...parsed.data, daily_focus_goal_min: form.goal });
      toast({ title: "Perfil salvo", tone: "success" });
    } catch (error) {
      toast({ title: "Não foi possível salvar", description: friendlyError(error), tone: "danger" });
    }
  }

  return (
    <Card className="gap-5">
      <div className="flex flex-wrap items-center gap-5">
        <AvatarPicker>
          {({ open, busy }) => (
            <div className="relative">
              <Avatar size={96} name={profile.name || undefined} src={avatarUrl} />
              <button
                type="button"
                onClick={open}
                disabled={busy}
                aria-label="Trocar foto de perfil"
                className="absolute -right-1 -bottom-1 flex size-11 items-center justify-center rounded-full border-[3px] border-surface bg-btn text-white disabled:opacity-60"
              >
                <Camera aria-hidden size={18} strokeWidth={1.75} />
              </button>
            </div>
          )}
        </AvatarPicker>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="type-metric wrap-break-word">{profile.name || "Seu perfil"}</span>
          <span className="text-sm text-fg-2">{profileSubtitle(profile)}</span>
        </div>
      </div>

      <form onSubmit={submit} aria-label="Dados do perfil" className="flex flex-col gap-5" noValidate>
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          <Field
            label="Nome"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            error={errors.name}
            maxLength={60}
          />
          <Field
            label="Curso"
            value={form.course}
            onChange={(e) => set("course", e.target.value)}
            error={errors.course}
            maxLength={80}
          />
          <Field
            label="Instituição"
            value={form.institution}
            onChange={(e) => set("institution", e.target.value)}
            error={errors.institution}
            maxLength={120}
          />
          <SelectField
            label="Semestre"
            value={form.semester}
            onChange={(e) => set("semester", e.target.value)}
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
        <Slider
          label="Meta diária de foco"
          valueText={formatFocusGoal(form.goal)}
          value={form.goal}
          min={FOCUS_GOAL.min}
          max={FOCUS_GOAL.max}
          step={FOCUS_GOAL.step}
          onChange={(v) => set("goal", v)}
        />
        <Button type="submit" className="self-start" disabled={!dirty || update.isPending}>
          {update.isPending ? "Salvando…" : "Salvar alterações"}
        </Button>
      </form>
    </Card>
  );
}

function PrivacyCard({ profile }: { profile: Profile }) {
  const update = useUpdateProfile();
  const { signOut } = useAuth();
  const [leaving, setLeaving] = useState(false);

  async function onSignOut() {
    setLeaving(true);
    try {
      await signOut(); // The gate goes to /entrar as soon as the session is gone.
    } catch (error) {
      toast({ title: "Não foi possível sair", description: friendlyError(error), tone: "danger" });
    } finally {
      setLeaving(false);
    }
  }

  return (
    <Card padding="compact" className="gap-2">
      <CardHeader title="Privacidade e dados" />
      <Switch
        checked={profile.show_in_ranking}
        onChange={(checked) =>
          update.mutate(
            { show_in_ranking: checked },
            {
              onError: (error) =>
                toast({ title: "Não foi possível salvar", description: friendlyError(error), tone: "danger" }),
            },
          )
        }
        label="Aparecer no ranking"
        description="Mostra só pontos e sequência"
      />
      <div className="flex flex-wrap gap-2 pt-1">
        <Button variant="ghost" size="s" icon={LogOut} onClick={onSignOut} disabled={leaving}>
          {leaving ? "Saindo…" : "Sair"}
        </Button>
      </div>
    </Card>
  );
}

/** Perfil e configurações (Perfil.html). Notifications and data export arrive in phase 11. */
export function ProfileView() {
  const { data: profile, isError, refetch } = useProfile();

  if (!profile) {
    return (
      <div className="flex max-w-xl flex-col gap-4" aria-busy={!isError}>
        {isError ? (
          <Card>
            <p className="type-body m-0">Não foi possível carregar o perfil.</p>
            <Button variant="secondary" className="self-start" onClick={() => void refetch()}>
              Tentar de novo
            </Button>
          </Card>
        ) : (
          <div className="h-72 animate-pulse rounded-card bg-surface-alt motion-reduce:animate-none" />
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <ProfileForm profile={profile} />
      <div className="flex min-w-0 flex-col gap-4">
        <Card padding="compact" className="gap-3">
          <CardHeader title="Aparência" />
          <ThemePicker className="w-full" />
        </Card>
        <PrivacyCard profile={profile} />
        <Card padding="compact">
          <CardHeader title="Sobre" />
          <Link href="/sobre" className="type-body inline-flex min-h-11 items-center font-semibold">
            Sobre e créditos
          </Link>
        </Card>
      </div>
    </div>
  );
}
