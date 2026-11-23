import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import { isThemePreference, type ThemePreference } from "@/lib/theme/theme";

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type Profile = Omit<ProfileRow, "theme"> & { theme: ThemePreference };

export function toProfile(row: ProfileRow): Profile {
  return { ...row, theme: isThemePreference(row.theme) ? row.theme : "system" };
}

/** Daily focus goal slider: 30 min to 6 h (section 7.11). */
export const FOCUS_GOAL = { min: 30, max: 360, step: 15, default: 120 } as const;

/** 120 → "2h", 90 → "1h 30min", 45 → "45min". */
export function formatFocusGoal(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

export const SEMESTERS = Array.from({ length: 12 }, (_, i) => i + 1);

export function semesterLabel(semester: number): string {
  return `${semester}º semestre`;
}

/** First name for greetings: "Gabriel Rossi" → "Gabriel". Splits on whitespace; empty → undefined. */
export function firstNameOf(name: string | null | undefined): string | undefined {
  return name?.trim().split(/\s+/)[0] || undefined;
}

/** "Biomedicina · 3º semestre" (sidebar card, profile header). */
export function profileSubtitle(profile: Pick<Profile, "course" | "semester">): string {
  return [profile.course || "Biomedicina", profile.semester ? semesterLabel(profile.semester) : null]
    .filter(Boolean)
    .join(" · ");
}

export const profileDetailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Escreva seu nome ou apelido." })
    .max(60, { error: "Use até 60 caracteres." }),
  semester: z.coerce
    .number({ error: "Escolha o semestre." })
    .int({ error: "Escolha o semestre." })
    .min(1, { error: "Escolha o semestre." })
    .max(12, { error: "Escolha o semestre." }),
  course: z.string().trim().min(1, { error: "Informe o curso." }).max(80, { error: "Use até 80 caracteres." }),
  institution: z.string().trim().max(120, { error: "Use até 120 caracteres." }),
});

export type ProfileDetails = z.infer<typeof profileDetailsSchema>;
export type ProfileDetailsErrors = Partial<Record<keyof ProfileDetails, string>>;

export const focusGoalSchema = z
  .number()
  .int()
  .min(FOCUS_GOAL.min)
  .max(FOCUS_GOAL.max)
  .refine((v) => v % FOCUS_GOAL.step === 0, { error: "A meta anda de 15 em 15 minutos." });

/** Validates the profile form and returns either clean data or one message per field. */
export function parseProfileDetails(
  input: Record<string, unknown>,
): { ok: true; data: ProfileDetails } | { ok: false; errors: ProfileDetailsErrors } {
  const result = profileDetailsSchema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  const errors: ProfileDetailsErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof ProfileDetails;
    errors[key] ??= issue.message;
  }
  return { ok: false, errors };
}
