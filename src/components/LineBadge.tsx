const LINE_IMAGES: Record<string, string> = {
  BX: "/brand/BX-64.webp",
  UX: "/brand/UX-64.webp",
  CX: "/brand/CX-64.webp",
  BX_EXPAND: "/brand/BXE-64.webp",
  UX_EXPAND: "/brand/UXE-64.webp",
  CX_EXPAND: "/brand/CXE-64.webp",
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
      width={20}
      height={20}
      loading="lazy"
      decoding="async"
      className={`h-5 w-auto object-contain inline-block ${className}`}
    />
  );
}

export function LineButtonLabel({ line }: { line: string }) {
  const src = LINE_IMAGES[line];
  if (!src) return <span>{LINE_LABELS[line] ?? line}</span>;
  return (
    <span className="flex items-center gap-1.5">
      <img src={src} alt={LINE_LABELS[line] ?? line} width={16} height={16} loading="lazy" decoding="async" className="h-4 w-auto object-contain" />
      <span>{LINE_LABELS[line] ?? line}</span>
    </span>
  );
}
