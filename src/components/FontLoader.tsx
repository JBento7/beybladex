"use client";

import type { FontDef } from "@/lib/arenaLayout";

// Loads the layout's custom fonts: uploaded fonts via @font-face (embedded data
// URLs) and Google Fonts via a stylesheet link. Render once near the board.
export default function FontLoader({ fonts }: { fonts: FontDef[] }) {
  const faces = fonts
    .filter((f) => f.kind === "upload" && f.src)
    .map((f) => `@font-face{font-family:'${f.family}';src:url(${f.src});font-display:swap;}`)
    .join("\n");
  const googles = fonts.filter((f) => f.kind === "google" && f.family).map((f) => f.family);
  const href = googles.length
    ? `https://fonts.googleapis.com/css2?${googles
        .map((g) => `family=${encodeURIComponent(g.trim()).replace(/%20/g, "+")}`)
        .join("&")}&display=swap`
    : null;
  return (
    <>
      {faces && <style dangerouslySetInnerHTML={{ __html: faces }} />}
      {href && <link rel="stylesheet" href={href} />}
    </>
  );
}
