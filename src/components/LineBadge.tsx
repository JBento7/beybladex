const LINE_IMAGES: Record<string, string> = {
  BX: "/bx.png",
  UX: "/ux.png",
  CX: "/cx.png",
  BX_EXPAND: "/bxe.png",
  UX_EXPAND: "/uxe.png",
  CX_EXPAND: "/cxe.png",
};

export const LINE_LABELS: Record<string, string> = {
  BX: "BX",
  UX: "UX",
  CX: "CX",
  BX_EXPAND: "BX Expand",
  UX_EXPAND: "UX Expand",
  CX_EXPAND: "CX Expand",
};

export function LineBadge({ line, className = "" }: { line: string; className?: string }) {
  const src = LINE_IMAGES[line];
  if (!src) return null;
  return (
    <img
      src={src}
      alt={LINE_LABELS[line] ?? line}
      title={LINE_LABELS[line] ?? line}
      className={`h-5 w-auto object-contain inline-block ${className}`}
    />
  );
}

export function LineButtonLabel({ line }: { line: string }) {
  const src = LINE_IMAGES[line];
  if (!src) return <span>{LINE_LABELS[line] ?? line}</span>;
  return (
    <span className="flex items-center gap-1.5">
      <img src={src} alt={LINE_LABELS[line] ?? line} className="h-4 w-auto object-contain" />
      <span>{LINE_LABELS[line] ?? line}</span>
    </span>
  );
}
