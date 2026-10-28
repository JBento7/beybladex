"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Home, LogIn, LogOut, Medal, MoreHorizontal, Trophy, UserPlus, X } from "lucide-react";
import AuthLink from "@/components/AuthLink";
import { MAIN_NAV, ACCOUNT_NAV, ORGANIZER_NAV, isActive, type NavItem } from "./navItems";

const BAR: NavItem[] = [
  { href: "/", label: "Início", Icon: Home, match: (p) => p === "/" },
  { href: "/tournaments", label: "Torneios", Icon: Trophy },
  { href: "/rankings", label: "Ranking", Icon: Medal },
];

// Bottom bar for phones: Início, Torneios, Ranking and "Mais", which opens a
// sheet with every other destination. The sheet is a modal dialog: focus
// moves into it, Esc closes it and focus returns to the "Mais" button.
export default function MobileNavigation({
  pathname,
  signedIn,
  isOrganizer,
  onSignOut,
}: {
  pathname: string;
  signedIn: boolean;
  isOrganizer: boolean;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const rest = MAIN_NAV.filter((i) => !BAR.some((b) => b.href === i.href));
  const moreActive = !BAR.some((b) => isActive(b, pathname));

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    sheetRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); moreRef.current?.focus(); }
      // Keep Tab inside the sheet while it is open.
      if (e.key === "Tab" && sheetRef.current) {
        const f = [...sheetRef.current.querySelectorAll<HTMLElement>("a,button")];
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const sheetLink = (item: NavItem) => {
    const active = isActive(item, pathname);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={`flex items-center gap-3 min-h-12 px-4 rounded-ctl text-body font-semibold ${active ? "bg-field text-fg" : "text-fg-2 hover:bg-hover"}`}
        >
          <item.Icon aria-hidden="true" className={`w-[22px] h-[22px] ${active ? "text-brand-yellow" : ""}`} />
          {item.label}
        </Link>
      </li>
    );
  };

  return (
    <>
      <nav
        aria-label="Navegação"
        className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-shell border-t border-line"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="grid grid-cols-4 min-h-16">
          {BAR.map((item) => {
            const active = isActive(item, pathname);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-full min-h-16 flex-col items-center justify-center gap-1 text-label ${active ? "text-fg" : "text-fg-2"}`}
                >
                  <item.Icon aria-hidden="true" className={`w-[22px] h-[22px] ${active ? "text-brand-yellow" : ""}`} />
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              ref={moreRef}
              type="button"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-controls="menu-mais"
              className={`flex w-full h-full min-h-16 flex-col items-center justify-center gap-1 text-label ${moreActive ? "text-fg" : "text-fg-2"}`}
            >
              <MoreHorizontal aria-hidden="true" className={`w-[22px] h-[22px] ${moreActive ? "text-brand-yellow" : ""}`} />
              Mais
            </button>
          </li>
        </ul>
      </nav>

      {open && (
        <div className="md:hidden fixed inset-0 z-50" id="menu-mais">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-black/60 cursor-default" onClick={() => setOpen(false)} tabIndex={-1} />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Mais opções"
            className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-card bg-shell border-t border-line shadow-menu p-4"
            style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="font-display text-title-3 text-fg">Mais</p>
              <button
                type="button"
                onClick={() => { setOpen(false); moreRef.current?.focus(); }}
                aria-label="Fechar"
                className="tap inline-flex items-center justify-center rounded-ctl text-fg-2 hover:bg-hover"
              >
                <X aria-hidden="true" className="w-5 h-5" />
              </button>
            </div>
            <ul className="space-y-1">{rest.map(sheetLink)}</ul>
            {signedIn && (
              <>
                <p className="mt-4 mb-1 px-4 text-label uppercase tracking-wide text-fg-3">Minha conta</p>
                <ul className="space-y-1">{ACCOUNT_NAV.map(sheetLink)}</ul>
              </>
            )}
            {isOrganizer && (
              <>
                <p className="mt-4 mb-1 px-4 text-label uppercase tracking-wide text-fg-3">Organizador</p>
                <ul className="space-y-1">{ORGANIZER_NAV.map(sheetLink)}</ul>
              </>
            )}
            <div className="mt-4 border-t border-line pt-4 space-y-1">
              {signedIn ? (
                <button type="button" onClick={onSignOut} className="flex w-full items-center gap-3 min-h-12 px-4 rounded-ctl text-body font-semibold text-fg-2 hover:bg-hover">
                  <LogOut aria-hidden="true" className="w-[22px] h-[22px]" /> Sair
                </button>
              ) : (
                <>
                  <AuthLink pathname={pathname} className="flex items-center gap-3 min-h-12 px-4 rounded-ctl text-body font-semibold text-fg hover:bg-hover">
                    <LogIn aria-hidden="true" className="w-[22px] h-[22px]" /> Entrar
                  </AuthLink>
                  <AuthLink page="/register" pathname={pathname} className="flex items-center gap-3 min-h-12 px-4 rounded-ctl text-body font-semibold text-fg hover:bg-hover">
                    <UserPlus aria-hidden="true" className="w-[22px] h-[22px]" /> Criar conta
                  </AuthLink>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
