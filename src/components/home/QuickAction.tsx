import Link from "next/link";
import type { LucideIcon } from "lucide-react";

// One shortcut card: the whole card is a single link (nothing else
// interactive inside it). Min height 80px, 16px padding, 24px icon.
export default function QuickAction({
  href,
  title,
  description,
  Icon,
}: {
  href: string;
  title: string;
  description?: string;
  Icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 min-h-20 p-4 rounded-card border border-line bg-card hover:bg-hover transition-colors duration-150"
    >
      <span aria-hidden="true" className="inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-ctl bg-field group-hover:bg-card">
        <Icon className="w-6 h-6 text-brand-yellow" />
      </span>
      <span className="min-w-0">
        <span className="block text-body font-semibold text-fg">{title}</span>
        {description && <span className="block text-small text-fg-2 line-clamp-2">{description}</span>}
      </span>
    </Link>
  );
}
