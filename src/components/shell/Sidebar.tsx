"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { MAIN_NAV, ACCOUNT_NAV, ORGANIZER_NAV, isActive, type NavItem } from "./navItems";
import { SIDEBAR_COOKIE } from "@/lib/shell";

// Desktop/tablet side menu. 240px expanded, 72px collapsed (tablet is always
// the 72px rail). Collapsed items keep their accessible name and show a
// tooltip on hover AND keyboard focus; the tooltip is position:fixed so the
// menu's own scroll area can't clip it.
export default function Sidebar({
  pathname,
  signedIn,
  isOrganizer,
  logo,
  logoAlt,
}: {
  pathname: string;
  signedIn: boolean;
  isOrganizer: boolean;
  logo: string;
  logoAlt: string;
}) {
  const [collapsedPref, setCollapsedPref] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [tip, setTip] = useState<{ label: string; top: number; left: number } | null>(null);

  useEffect(() => {
    setCollapsedPref(document.documentElement.dataset.sidebar === "collapsed");
    const mq = window.matchMedia("(min-width: 1200px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);
  const collapsed = !isDesktop || collapsedPref;

  const toggle = () => {
    const next = !collapsedPref;
    setCollapsedPref(next);
    setTip(null);
    document.documentElement.dataset.sidebar = next ? "collapsed" : "expanded";
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  };

  const showTip = (label: string, el: HTMLElement) => {
    if (!collapsed) return;
    const r = el.getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2, left: r.right + 8 });
  };

  const renderItem = (item: NavItem) => {
    const active = isActive(item, pathname);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          aria-label={collapsed ? item.label : undefined}
          onMouseEnter={(e) => showTip(item.label, e.currentTarget)}
          onMouseLeave={() => setTip(null)}
          onFocus={(e) => showTip(item.label, e.currentTarget)}
          onBlur={() => setTip(null)}
          className={`relative flex items-center gap-3 min-h-11 px-3 rounded-ctl text-small font-semibold transition-colors duration-150 ${
            collapsed ? "justify-center" : ""
          } ${active ? "bg-field text-fg" : "text-fg-2 hover:bg-hover hover:text-fg"}`}
        >
          {active && <span aria-hidden="true" className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-brand-yellow" />}
          <item.Icon aria-hidden="true" className={`w-5 h-5 shrink-0 ${active ? "text-brand-yellow" : ""}`} />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </Link>
      </li>
    );
  };

  const group = (title: string, items: NavItem[]) => (
    <div className="mt-6">
      {collapsed ? (
        <div aria-hidden="true" className="mx-3 mb-2 border-t border-line" />
      ) : (
        <p className="px-3 mb-2 text-label uppercase tracking-wide text-fg-3">{title}</p>
      )}
      <ul className="space-y-1" aria-label={title}>{items.map(renderItem)}</ul>
    </div>
  );

  return (
    <aside
      aria-label="Menu principal"
      className={`hidden md:flex fixed inset-y-0 left-0 z-40 flex-col h-[100dvh] bg-shell border-r border-line transition-[width] duration-200 ${
        collapsed ? "w-[var(--sidebar-w-collapsed)]" : "w-[var(--sidebar-w)]"
      }`}
    >
      <div className={`flex items-center h-[var(--header-h)] shrink-0 ${collapsed ? "justify-center px-2" : "px-4"}`}>
        <Link href="/" aria-label="LBL — página inicial" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt={logoAlt} className={`w-auto object-contain ${collapsed ? "h-9 max-w-[48px]" : "h-12 max-w-[180px]"}`} />
        </Link>
      </div>

      <nav aria-label="Navegação" className="flex-1 overflow-y-auto px-3 pb-4">
        <ul className="space-y-1">{MAIN_NAV.map(renderItem)}</ul>
        {signedIn && group("Minha conta", ACCOUNT_NAV)}
        {isOrganizer && group("Organizador", ORGANIZER_NAV)}
      </nav>

      {/* Collapse/expand: desktop only (tablet is always the rail). */}
      <div className="hidden desk:block p-3 border-t border-line">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsedPref}
          aria-label={collapsedPref ? "Expandir menu" : "Recolher menu"}
          onMouseEnter={(e) => showTip(collapsedPref ? "Expandir menu" : "Recolher menu", e.currentTarget)}
          onMouseLeave={() => setTip(null)}
          onFocus={(e) => showTip(collapsedPref ? "Expandir menu" : "Recolher menu", e.currentTarget)}
          onBlur={() => setTip(null)}
          className={`flex items-center gap-3 w-full min-h-11 px-3 rounded-ctl text-small font-semibold text-fg-2 hover:bg-hover hover:text-fg transition-colors duration-150 ${collapsed ? "justify-center" : ""}`}
        >
          {collapsedPref ? <PanelLeftOpen aria-hidden="true" className="w-5 h-5" /> : <PanelLeftClose aria-hidden="true" className="w-5 h-5" />}
          {!collapsed && <span>Recolher menu</span>}
        </button>
      </div>

      {tip && collapsed && (
        <span
          role="tooltip"
          className="fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-tag bg-field border border-line px-2 py-1 text-small font-semibold text-fg shadow-menu pointer-events-none"
          style={{ top: tip.top, left: tip.left }}
        >
          {tip.label}
        </span>
      )}
    </aside>
  );
}
