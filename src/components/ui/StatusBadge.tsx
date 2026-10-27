import { CheckCircle2, CircleDot, ClipboardList, PencilLine, type LucideIcon } from "lucide-react";

// Tournament situation: icon + text (color only reinforces it).
//  green = sign-ups open, blue = in progress, gray = finished / draft.
const MAP: Record<string, { label: string; cls: string; Icon: LucideIcon }> = {
  REGISTRATION: { label: "Inscrições abertas", cls: "bg-success-bg text-success", Icon: ClipboardList },
  IN_PROGRESS: { label: "Em andamento", cls: "bg-info-bg text-info", Icon: CircleDot },
  FINISHED: { label: "Finalizado", cls: "bg-field text-fg-2", Icon: CheckCircle2 },
  DRAFT: { label: "Em preparação", cls: "bg-field text-fg-2", Icon: PencilLine },
};

export function statusLabel(status: string) {
  return MAP[status]?.label ?? status;
}

export default function StatusBadge({ status, className = "" }: { status: string; className?: string }) {
  const s = MAP[status] ?? MAP.DRAFT;
  return (
    <span className={`inline-flex items-center gap-1 rounded-tag px-2 py-1 text-label ${s.cls} ${className}`}>
      <s.Icon aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
      {s.label}
    </span>
  );
}

/** Small neutral tag (league, format, "Oficial"...). */
export function Tag({ children, tone = "neutral", className = "" }: { children: React.ReactNode; tone?: "neutral" | "yellow" | "info" | "warn"; className?: string }) {
  const cls = {
    neutral: "bg-field text-fg-2 border border-line",
    yellow: "bg-brand-yellow/15 text-brand-yellow",
    info: "bg-info-bg text-info",
    warn: "bg-warn-bg text-warn",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-tag px-2 py-1 text-label ${cls} ${className}`}>{children}</span>;
}
