import Link from "next/link";
import type { LucideIcon } from "lucide-react";

// One shortcut card: the whole card is a single link (nothing else
// interactive inside it). 20px padding, 12px gap, 24px icon; min height
// 104px on desktop, automatic on phones; text is never cut.
export default function QuickAction({
  href,
  title,
  description,
  note,
  Icon,
}: {
  href: string;
  title: string;
  description?: string;
  /** Small auxiliary line, e.g. "Requer login" (only when it applies). */
  note?: string;
  Icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 md:min-h-[6.5rem] p-5 rounded-card border border-line bg-card hover:bg-hover transition-colors duration-150"
    >
      <Icon aria-hidden="true" className="w-6 h-6 shrink-0 mt-0.5 text-brand-yellow" />
      <span className="min-w-0">
        <span className="block text-body font-semibold text-fg">{title}</span>
        {description && <span className="block text-small text-fg-2">{description}</span>}
        {note && <span className="mt-1 block text-label font-medium text-fg-3">{note}</span>}
      </span>
    </Link>
  );
}
