"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Gauge, LogOut, User } from "lucide-react";

// Signed-in account button (avatar + name) with a small menu. Closes on Esc,
// on outside click and after choosing; focus returns to the button.
export default function AccountMenu({
  name,
  avatarUrl,
  isOrganizer,
  onSignOut,
}: {
  name: string;
  avatarUrl: string | null;
  isOrganizer: boolean;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    box.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const item = "flex items-center gap-3 min-h-11 px-3 rounded-ctl text-small font-semibold text-fg-2 hover:bg-hover hover:text-fg focus-visible:bg-hover";
  return (
    <div className="relative" ref={box}>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Conta de ${name}`}
        className="flex items-center gap-2 min-h-11 pl-1 pr-2 rounded-ctl hover:bg-hover transition-colors duration-150"
      >
        <Avatar name={name} url={avatarUrl} size={36} />
        <span className="hidden md:block max-w-[160px] truncate text-small font-semibold text-fg">{name}</span>
        {isOrganizer && <span className="hidden md:inline rounded-tag bg-brand-yellow/15 px-2 py-0.5 text-label text-brand-yellow">Admin</span>}
        <ChevronDown aria-hidden="true" className="w-4 h-4 text-fg-3" />
      </button>
      {open && (
        <div role="menu" aria-label="Conta" className="absolute right-0 mt-2 w-56 rounded-card bg-shell border border-line shadow-menu p-2 z-50">
          <Link role="menuitem" href="/dashboard" className={item} onClick={() => setOpen(false)}>
            <Gauge aria-hidden="true" className="w-5 h-5" /> Meu painel
          </Link>
          <Link role="menuitem" href="/profile" className={item} onClick={() => setOpen(false)}>
            <User aria-hidden="true" className="w-5 h-5" /> Perfil
          </Link>
          <button role="menuitem" type="button" className={`${item} w-full`} onClick={() => { setOpen(false); onSignOut(); }}>
            <LogOut aria-hidden="true" className="w-5 h-5" /> Sair
          </button>
        </div>
      )}
    </div>
  );
}

/** Round avatar with initial fallback. Decorative unless `alt` is given. */
export function Avatar({ name, url, size = 40, alt = "" }: { name: string; url?: string | null; size?: number; alt?: string }) {
  const style = { width: size, height: size };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={alt} style={style} className="rounded-full object-cover shrink-0 bg-field" />;
  }
  return (
    <span aria-hidden={alt ? undefined : "true"} style={style} className="rounded-full shrink-0 bg-field border border-line inline-flex items-center justify-center font-display font-bold text-fg-2">
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}
