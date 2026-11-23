import { SUBJECT_COLORS, type SubjectColor } from "./colors";

export interface SubjectDraft {
  name: string;
  color: SubjectColor;
  /** lucide icon name (kebab-case). */
  icon: string;
}

/** Chips of the onboarding (Onboarding.html), with the color of each chip. */
export const SUGGESTED_SUBJECTS: readonly SubjectDraft[] = [
  { name: "Anatomia Humana", color: "celeste", icon: "person-standing" },
  { name: "Bioquímica", color: "rosa", icon: "flask-conical" },
  { name: "Citologia e Histologia", color: "lilas", icon: "microscope" },
  { name: "Fisiologia", color: "amarelo", icon: "heart-pulse" },
  { name: "Imunologia", color: "verde", icon: "shield" },
  { name: "Microbiologia", color: "celeste", icon: "bug" },
  { name: "Genética", color: "rosa", icon: "dna" },
  { name: "Parasitologia", color: "amarelo", icon: "worm" },
];

export const CUSTOM_SUBJECT_ICON = "book-open";

/** Collapses whitespace: "  Farmaco   logia " → "Farmaco logia". */
export function normalizeSubjectName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function subjectKey(name: string): string {
  return normalizeSubjectName(name).toLocaleLowerCase("pt-BR");
}

/** Colors for "+ Outra" rotate through the five pastels. */
export function colorForCustomSubject(index: number): SubjectColor {
  return SUBJECT_COLORS[index % SUBJECT_COLORS.length];
}

/** Drafts that don't exist yet (case-insensitive), without duplicates: resubmitting is harmless. */
export function subjectsToCreate(drafts: readonly SubjectDraft[], existingNames: readonly string[]): SubjectDraft[] {
  const seen = new Set(existingNames.map(subjectKey));
  const out: SubjectDraft[] = [];
  for (const draft of drafts) {
    const name = normalizeSubjectName(draft.name);
    const key = subjectKey(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...draft, name });
  }
  return out;
}
