import {
  BookOpen,
  BriefcaseBusiness,
  Ellipsis,
  Folder,
  House,
  ListChecks,
  PenLine,
  PersonStanding,
  Timer,
  Trophy,
  type LucideIcon,
} from "lucide-react";

export interface NavEntry {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Sidebar order (section 4.4). */
export const PRIMARY_NAV: readonly NavEntry[] = [
  { href: "/inicio", label: "Início", icon: House },
  { href: "/materias", label: "Matérias", icon: BookOpen },
  { href: "/caderno", label: "Caderno", icon: PenLine },
  { href: "/estudo", label: "Resumos e testes", icon: ListChecks },
  { href: "/atlas", label: "Atlas 3D", icon: PersonStanding },
  { href: "/foco", label: "Modo foco", icon: Timer },
  { href: "/extensao", label: "Extensão", icon: BriefcaseBusiness },
  { href: "/arquivos", label: "Arquivos", icon: Folder },
  { href: "/grupo", label: "Grupo e ranking", icon: Trophy },
];

/** Phone tab bar: Início, Matérias, Foco, Ranking + "Mais". */
export const TAB_BAR_NAV: readonly NavEntry[] = [
  { href: "/inicio", label: "Início", icon: House },
  { href: "/materias", label: "Matérias", icon: BookOpen },
  { href: "/foco", label: "Foco", icon: Timer },
  { href: "/grupo", label: "Ranking", icon: Trophy },
];

export const MORE_ICON = Ellipsis;

const TAB_BAR_HREFS = new Set(TAB_BAR_NAV.map((n) => n.href));

/** Entries that live behind "Mais" on phones. */
export const MORE_NAV: readonly NavEntry[] = PRIMARY_NAV.filter((n) => !TAB_BAR_HREFS.has(n.href));

/** `/materias/123` keeps "Matérias" active. */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
