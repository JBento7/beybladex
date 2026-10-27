"use client";

import { useId, useState, type ReactNode } from "react";

// Collapses long content to a few lines with a "Ver ... completo" toggle.
// Accessible: a real <button> with aria-expanded/aria-controls, works with the
// keyboard, and the full content stays in the DOM (screen readers can reach it
// and nothing is lost when collapsed).
export default function ExpandableText({
  children,
  collapsible = true,
  moreLabel = "Ver texto completo",
  lessLabel = "Recolher texto",
  collapsedClass = "max-h-48",
}: {
  children: ReactNode;
  collapsible?: boolean;
  moreLabel?: string;
  lessLabel?: string;
  collapsedClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!collapsible) return <>{children}</>;
  return (
    <div>
      <div
        id={id}
        className={`relative ${open ? "" : `${collapsedClass} overflow-hidden`}`}
      >
        {children}
        {!open && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#111827] to-transparent" />
        )}
      </div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="tap mt-2 inline-flex items-center gap-1.5 px-3 rounded-lg text-sm font-bold text-[var(--accent)] hover:bg-white/5"
      >
        <span aria-hidden="true">{open ? "▲" : "▼"}</span>
        {open ? lessLabel : moreLabel}
      </button>
    </div>
  );
}
