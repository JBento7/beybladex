import {
  BookOpen, Gauge, Home, Medal, Shield, Swords, Trophy, User, Users, Wrench, Zap, type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; Icon: LucideIcon; match?: (path: string) => boolean };

// Main destinations (everyone, signed in or not).
export const MAIN_NAV: NavItem[] = [
  { href: "/", label: "Início", Icon: Home, match: (p) => p === "/" },
  { href: "/tournaments", label: "Torneios", Icon: Trophy },
  { href: "/rankings", label: "Ranking", Icon: Medal },
  { href: "/community", label: "Comunidade", Icon: Users },
  { href: "/quick-match", label: "Partidas rápidas", Icon: Zap },
  { href: "/regras", label: "Regras", Icon: BookOpen },
];

// Signed-in player's own area.
export const ACCOUNT_NAV: NavItem[] = [
  { href: "/dashboard", label: "Meu painel", Icon: Gauge },
  { href: "/profile", label: "Perfil", Icon: User },
  { href: "/beyparts", label: "BeyParts", Icon: Wrench },
];

// Organizer tools — shown only to ORGANIZER accounts (the pages enforce
// the same rule on the server; this is just navigation).
export const ORGANIZER_NAV: NavItem[] = [
  { href: "/admin", label: "Administração", Icon: Shield },
  { href: "/tournaments/create", label: "Criar torneio", Icon: Swords, match: (p) => p === "/tournaments/create" },
];

export function isActive(item: NavItem, pathname: string) {
  if (item.match) return item.match(pathname);
  if (item.href === "/tournaments" && pathname === "/tournaments/create") return false;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

// Title shown in the header for the current section.
export function sectionTitle(pathname: string): string {
  const all = [...ORGANIZER_NAV, ...MAIN_NAV, ...ACCOUNT_NAV];
  const hit = all.find((i) => isActive(i, pathname));
  if (hit) return hit.label;
  if (pathname.startsWith("/combos")) return "Combos";
  if (pathname.startsWith("/beyblade")) return "Beyblades";
  return "LBL";
}
