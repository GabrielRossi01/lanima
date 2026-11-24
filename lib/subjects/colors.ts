/** Subject colors, stored in the database with these Portuguese keys (section 5). */
export const SUBJECT_COLORS = [
  "amarelo",
  "rosa",
  "verde",
  "celeste",
  "lilas",
  "pessego",
  "lima",
  "turquesa",
  "indigo",
  "orquidea",
] as const;
export type SubjectColor = (typeof SUBJECT_COLORS)[number];

/** Tailwind background class for each pastel. Text on top is always `text-ink`. */
export const SUBJECT_BG: Record<SubjectColor | "neutro", string> = {
  amarelo: "bg-hl-yellow",
  rosa: "bg-hl-pink",
  verde: "bg-hl-green",
  celeste: "bg-hl-sky",
  lilas: "bg-hl-lilac",
  pessego: "bg-hl-peach",
  lima: "bg-hl-lime",
  turquesa: "bg-hl-teal",
  indigo: "bg-hl-indigo",
  orquidea: "bg-hl-orchid",
  neutro: "bg-subtle",
};

export const SUBJECT_COLOR_LABEL: Record<SubjectColor, string> = {
  amarelo: "Amarelo",
  rosa: "Rosa",
  verde: "Verde",
  celeste: "Celeste",
  lilas: "Lilás",
  pessego: "Pêssego",
  lima: "Lima",
  turquesa: "Turquesa",
  indigo: "Índigo",
  orquidea: "Orquídea",
};
