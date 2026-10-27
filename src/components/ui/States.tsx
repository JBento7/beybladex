import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// Empty and error states share one layout: icon, title, explanation, actions.
export function EmptyState({
  icon: Icon,
  title,
  children,
  actions,
  className = "",
}: {
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-card border border-line bg-card p-6 sm:p-8 text-center ${className}`}>
      {Icon && <Icon aria-hidden="true" className="mx-auto mb-3 w-8 h-8 text-fg-3" />}
      <h2 className="font-display text-title-3 text-fg">{title}</h2>
      {children && <div className="mt-2 text-body text-fg-2 max-w-prose mx-auto">{children}</div>}
      {actions && <div className="mt-6 flex flex-wrap justify-center gap-3">{actions}</div>}
    </div>
  );
}

export function ErrorState({ title, children, actions, className = "" }: { title: string; children?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div role="alert" className={`rounded-card border border-danger/40 bg-danger-bg p-6 sm:p-8 text-center ${className}`}>
      <h2 className="font-display text-title-3 text-fg">{title}</h2>
      {children && <div className="mt-2 text-body text-fg-2 max-w-prose mx-auto">{children}</div>}
      {actions && <div className="mt-6 flex flex-wrap justify-center gap-3">{actions}</div>}
    </div>
  );
}
