// Demonstration Beyblades for the layout editor preview (docs/EDITOR-LAYOUT.md
// § Beyblades) — ONLY the editor uses them; the telão always shows the
// player's real parts (lib/beyArt). Pure module (no imports): unit-tested.
//
// One coherent example per format, from the catalog (BeyPart), following the
// composition of each line (lib/combo-lines):
//   BX / UX     one blade (BLADE of that line) → a single image;
//   CX          lock chip + main blade (CX) + assist blade;
//   CX Expand   lock chip + over blade + main blade (CX_EXPAND) + assist blade.
// Catalog images first; a part without image (or a missing part) becomes a
// marker drawn with the piece's own name and line — never the image of
// another category or of another format.

export type BeyKind = "BX" | "UX" | "CX" | "CX_EXPAND";
export const BEY_KINDS: BeyKind[] = ["BX", "UX", "CX", "CX_EXPAND"];
export const BEY_KIND_LABEL: Record<BeyKind, string> = { BX: "BX", UX: "UX", CX: "CX", CX_EXPAND: "CX Expand" };

export type CatalogPart = { line: string; category: string; name: string; imageUrl: string | null };
export type ExamplePiece = { role: "blade" | "lock" | "metal" | "assist" | "over"; label: string; name: string; src: string; fromCatalog: boolean };
export type BeyExample = {
  kind: BeyKind;
  name: string;
  /** BX/UX: the blade image. */
  img: string | null;
  /** CX / CX Expand: the pieces (same shape the telão receives). */
  pieces: { kind: "CX" | "CX_EXPAND"; lock: string | null; metal: string | null; assist: string | null; over: string | null } | null;
  parts: ExamplePiece[];
};

const COLOR: Record<BeyKind, string> = { BX: "#00a6d6", UX: "#ff8a00", CX: "#e63946", CX_EXPAND: "#d4148c" };
const ROLE_LABEL: Record<ExamplePiece["role"], string> = { blade: "Blade", lock: "Lock Chip", metal: "Main Blade", assist: "Assist Blade", over: "Over Blade" };

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const cut = (t: string, n = 18) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/**
 * Marker for a piece without catalog image: a transparent drawing shaped like
 * the piece (ring for the assist blade, star for the main blade, dashed ring
 * for the over blade, small disc for the lock chip, disc for a whole BX/UX),
 * with the line and the piece's name. Stacked, the pieces still read as one
 * assembled Beyblade.
 */
export function pieceMarker(kind: BeyKind, role: ExamplePiece["role"], name: string): string {
  const c = COLOR[kind];
  const line = BEY_KIND_LABEL[kind];
  const txt = (y: number, t: string, size = 12) => `<text x="100" y="${y}" font-family="Arial, sans-serif" font-size="${size}" font-weight="700" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke" text-anchor="middle">${esc(t)}</text>`;
  let body: string;
  switch (role) {
    case "assist": body = `<circle cx="100" cy="100" r="88" fill="none" stroke="${c}" stroke-width="14" opacity="0.75"/>${txt(196, `${line} · ${ROLE_LABEL[role]}`)}${txt(182, cut(name), 11)}`; break;
    case "metal": {
      const pts = Array.from({ length: 12 }, (_, i) => { const r = i % 2 ? 40 : 72; const a = (Math.PI / 6) * i - Math.PI / 2; return `${(100 + r * Math.cos(a)).toFixed(1)},${(100 + r * Math.sin(a)).toFixed(1)}`; }).join(" ");
      body = `<polygon points="${pts}" fill="${c}" fill-opacity="0.35" stroke="${c}" stroke-width="3"/>${txt(16, `${ROLE_LABEL[role]}: ${cut(name, 14)}`, 11)}`;
      break;
    }
    case "over": body = `<circle cx="100" cy="100" r="60" fill="none" stroke="#f4c430" stroke-width="8" stroke-dasharray="14 8"/>${txt(42, `Over: ${cut(name, 14)}`, 11)}`; break;
    case "lock": body = `<circle cx="100" cy="100" r="24" fill="${c}" stroke="#fff" stroke-width="3"/>${txt(104, "Lock", 11)}${txt(140, cut(name, 16), 10)}`; break;
    default: body = `<circle cx="100" cy="100" r="80" fill="${c}" fill-opacity="0.3" stroke="${c}" stroke-width="6"/>${txt(96, line, 22)}${txt(118, cut(name), 12)}`;
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="400" height="400">${body}</svg>`)}`;
}

/** First catalog part of a category, trying the lines in order; parts WITH
 *  image win over parts without; ties by name (stable choice). */
function pick(parts: CatalogPart[], category: string, lines: string[]): CatalogPart | null {
  for (const line of lines) {
    const pool = parts.filter((p) => p.category === category && p.line === line).sort((a, b) => a.name.localeCompare(b.name));
    const withImg = pool.find((p) => !!p.imageUrl);
    if (withImg) return withImg;
  }
  for (const line of lines) {
    const any = parts.filter((p) => p.category === category && p.line === line).sort((a, b) => a.name.localeCompare(b.name))[0];
    if (any) return any;
  }
  return null;
}

export function buildExamples(parts: CatalogPart[]): Record<BeyKind, BeyExample> {
  const piece = (kind: BeyKind, role: ExamplePiece["role"], category: string, lines: string[]): ExamplePiece => {
    const p = pick(parts, category, lines);
    const name = p?.name ?? `${ROLE_LABEL[role]} ${BEY_KIND_LABEL[kind]}`;
    return { role, label: ROLE_LABEL[role], name, src: p?.imageUrl || pieceMarker(kind, role, name), fromCatalog: !!p?.imageUrl };
  };
  const ratchet = pick(parts, "RATCHET", ["RATCHET"])?.name ?? "";
  const bit = pick(parts, "BIT", ["BIT"])?.name ?? "";
  const combo = (main: string) => [main, `${ratchet}${bit}`].filter(Boolean).join(" ");

  const single = (kind: "BX" | "UX"): BeyExample => {
    const blade = piece(kind, "blade", "BLADE", [kind]);
    return { kind, name: combo(blade.name), img: blade.src, pieces: null, parts: [blade] };
  };
  const cx = (expand: boolean): BeyExample => {
    const kind: BeyKind = expand ? "CX_EXPAND" : "CX";
    const own = expand ? "CX_EXPAND" : "CX", other = expand ? "CX" : "CX_EXPAND";
    // Lock chips and assist blades are shared by both lines (lib/combo-lines);
    // the main blade (and the over blade) belong to their own line only.
    const lock = piece(kind, "lock", "LOCK_CHIP", [own, other]);
    const metal = piece(kind, "metal", "MAIN_BLADE", [own]);
    const assist = piece(kind, "assist", "ASSIST_BLADE", [own, other]);
    const over = expand ? piece(kind, "over", "OVER_BLADE", ["CX_EXPAND"]) : null;
    const list = [lock, ...(over ? [over] : []), metal, assist];
    return {
      kind,
      name: combo([lock.name, (over ?? metal).name, assist.name].join(" ")),
      img: null,
      pieces: { kind: expand ? "CX_EXPAND" : "CX", lock: lock.src, metal: metal.src, assist: assist.src, over: over?.src ?? null },
      parts: list,
    };
  };
  return { BX: single("BX"), UX: single("UX"), CX: cx(false), CX_EXPAND: cx(true) };
}
