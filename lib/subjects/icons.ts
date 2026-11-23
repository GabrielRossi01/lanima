import {
  Activity,
  Atom,
  BookOpen,
  Brain,
  Bug,
  Dna,
  FlaskConical,
  HeartPulse,
  Leaf,
  Microscope,
  PersonStanding,
  Pill,
  Shield,
  Stethoscope,
  TestTube,
  Users,
  Worm,
  type LucideIcon,
} from "lucide-react";

/** Icons offered for subjects (stored by lucide name in subjects.icon). */
export const SUBJECT_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  "book-open": { icon: BookOpen, label: "Livro" },
  "person-standing": { icon: PersonStanding, label: "Corpo humano" },
  "flask-conical": { icon: FlaskConical, label: "Frasco" },
  microscope: { icon: Microscope, label: "Microscópio" },
  "heart-pulse": { icon: HeartPulse, label: "Coração" },
  shield: { icon: Shield, label: "Escudo" },
  bug: { icon: Bug, label: "Micro-organismo" },
  dna: { icon: Dna, label: "DNA" },
  worm: { icon: Worm, label: "Parasita" },
  brain: { icon: Brain, label: "Cérebro" },
  pill: { icon: Pill, label: "Medicamento" },
  "test-tube": { icon: TestTube, label: "Tubo de ensaio" },
  atom: { icon: Atom, label: "Átomo" },
  stethoscope: { icon: Stethoscope, label: "Estetoscópio" },
  activity: { icon: Activity, label: "Sinais vitais" },
  leaf: { icon: Leaf, label: "Botânica" },
  users: { icon: Users, label: "Pessoas" },
};

export const DEFAULT_SUBJECT_ICON = "book-open";

export function subjectIcon(name: string | null | undefined): LucideIcon {
  return SUBJECT_ICONS[name ?? ""]?.icon ?? BookOpen;
}
