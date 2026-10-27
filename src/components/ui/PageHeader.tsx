import type { ReactNode } from "react";

// Page title block: H1 (Barlow Condensed 30/34 mobile, 40/44 desktop), an
// optional one-line description and optional actions on the right.
export default function PageHeader({
  title,
  description,
  meta,
  actions,
}: {
  title: string;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-title-1 desk:text-title-1-lg text-fg break-anywhere">{title}</h1>
        {description && <p className="mt-2 text-body text-fg-2">{description}</p>}
        {meta && <div className="mt-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-3 shrink-0">{actions}</div>}
    </div>
  );
}

/** Section title (24/30 mobile, 28/34 desktop). */
export function SectionTitle({ id, children, className = "" }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <h2 id={id} className={`font-display text-title-2 desk:text-title-2-lg text-fg ${className}`}>
      {children}
    </h2>
  );
}
