// Shared layout config for the arena scoreboard. The visual editor (admin) saves
// per-field positions/sizes here and the arena display reads them, falling back
// to these defaults. All values are percentages of the 1672×941 board.
//
// - text fields: x/y are the CENTER; w is max width (%); fs is font size (cqw).
// - img fields:  x/y are the TOP-LEFT; w/h are the size (%).

// pipsV = 5 dots stacked vertically (PONTOS); pipsH = 3 dots in a row (VITÓRIAS).
// For pip fields the box (x,y,w,h) is the group extent and fs is the dot diameter (cqw).
export type FieldKind = "text" | "img" | "pipsV" | "pipsH";
export type Field = { x: number; y: number; w?: number; h?: number; fs?: number; ff?: string };

// A custom font in the library: uploaded (embedded via @font-face) or a Google
// Font (loaded by name). `family` is the CSS font-family used everywhere.
export type FontDef = { family: string; kind: "upload" | "google"; src?: string };

// CSS font-family stack for an element, falling back to the default placar font.
export function fontStack(ff?: string | null): string {
  return ff ? `'${ff}', 'Arial Black', system-ui, sans-serif` : "'Arial Black', system-ui, sans-serif";
}
/** `inherit`: until this element is positioned on its own, it uses the
 *  (saved) position of that other element — new elements added later (e.g.
 *  the CX Expand pieces) start exactly where an existing layout already put
 *  the matching element, so old layouts look the same. */
export type FieldDef = Field & {
  kind: FieldKind; label: string; inherit?: string;
  /** "center": x/y are the inherited element's CENTER (not its top-left). */
  inheritMode?: "center";
  /** A CX / CX Expand assembly of the winner screen — only its centre is
   *  positioned here; sizes and piece offsets come from the scoreboard's
   *  assembly of the SAME system (assemblyOf). */
  group?: "CX" | "CX_EXPAND";
};
export type Layout = Record<string, Field>;

export const BOARD_W = 1672;
export const BOARD_H = 941;
export const BOARD_ASPECT = BOARD_W / BOARD_H;

// Order here is the order shown in the editor sidebar.
export const SCOREBOARD_DEFAULTS: Record<string, FieldDef> = {
  nameL: { kind: "text", label: "Nome (esq)", x: 13.1, y: 8.3, w: 21, fs: 1.9 },
  nameR: { kind: "text", label: "Nome (dir)", x: 86.6, y: 8.3, w: 21, fs: 1.9 },
  photoL: { kind: "img", label: "Foto (esq)", x: 3.65, y: 16.4, w: 18, h: 28 },
  photoR: { kind: "img", label: "Foto (dir)", x: 78.35, y: 16.4, w: 18, h: 28 },
  beyNameL: { kind: "text", label: "Bey nome (esq)", x: 13.2, y: 50.9, w: 20, fs: 1.3 },
  beyNameR: { kind: "text", label: "Bey nome (dir)", x: 86.2, y: 50.9, w: 20, fs: 1.3 },
  // Simple systems (BX, BX Expand, UX, UX Expand): ONE blade image, one
  // shared configuration for the four.
  beyImgL: { kind: "img", label: "Imagem simples (esq)", x: 7.1, y: 57.7, w: 12.5, h: 22.2 },
  beyImgR: { kind: "img", label: "Imagem simples (dir)", x: 79.84, y: 57.7, w: 12.5, h: 22.2 },
  // CX: 3 stacked transparent PNGs — assist blade (back), main/metal blade,
  // lock chip (front). Each piece is positionable on its own.
  cxAssistL: { kind: "img", label: "CX · Assist Blade (esq)", x: 7.1, y: 57.7, w: 12.5, h: 22.2 },
  cxMetalL: { kind: "img", label: "CX · Main Blade (esq)", x: 7.1, y: 57.7, w: 12.5, h: 22.2 },
  cxLockL: { kind: "img", label: "CX · Lock Chip (esq)", x: 7.1, y: 57.7, w: 12.5, h: 22.2 },
  cxAssistR: { kind: "img", label: "CX · Assist Blade (dir)", x: 79.84, y: 57.7, w: 12.5, h: 22.2 },
  cxMetalR: { kind: "img", label: "CX · Main Blade (dir)", x: 79.84, y: 57.7, w: 12.5, h: 22.2 },
  cxLockR: { kind: "img", label: "CX · Lock Chip (dir)", x: 79.84, y: 57.7, w: 12.5, h: 22.2 },
  // CX Expand: 4 pieces (lib/combo-lines) — assist (back), main blade, over
  // blade, lock chip (front). Until edited they follow the CX pieces.
  cxeAssistL: { kind: "img", label: "CX Expand · Assist Blade (esq)", x: 7.1, y: 57.7, w: 12.5, h: 22.2, inherit: "cxAssistL" },
  cxeMetalL: { kind: "img", label: "CX Expand · Main Blade (esq)", x: 7.1, y: 57.7, w: 12.5, h: 22.2, inherit: "cxMetalL" },
  cxeOverL: { kind: "img", label: "CX Expand · Over Blade (esq)", x: 7.1, y: 57.7, w: 12.5, h: 22.2, inherit: "cxMetalL" },
  cxeLockL: { kind: "img", label: "CX Expand · Lock Chip (esq)", x: 7.1, y: 57.7, w: 12.5, h: 22.2, inherit: "cxLockL" },
  cxeAssistR: { kind: "img", label: "CX Expand · Assist Blade (dir)", x: 79.84, y: 57.7, w: 12.5, h: 22.2, inherit: "cxAssistR" },
  cxeMetalR: { kind: "img", label: "CX Expand · Main Blade (dir)", x: 79.84, y: 57.7, w: 12.5, h: 22.2, inherit: "cxMetalR" },
  cxeOverR: { kind: "img", label: "CX Expand · Over Blade (dir)", x: 79.84, y: 57.7, w: 12.5, h: 22.2, inherit: "cxMetalR" },
  cxeLockR: { kind: "img", label: "CX Expand · Lock Chip (dir)", x: 79.84, y: 57.7, w: 12.5, h: 22.2, inherit: "cxLockR" },
  // Finishes boxes (SET N + badges), grouped per player.
  finishesL: { kind: "img", label: "Finishes (esq)", x: 31.3, y: 11.5, w: 15.4, h: 34 },
  finishesR: { kind: "img", label: "Finishes (dir)", x: 53.3, y: 11.5, w: 15.4, h: 34 },
  scoreL: { kind: "text", label: "Placar (esq)", x: 38, y: 56.5, w: 12, fs: 6.6 },
  scoreR: { kind: "text", label: "Placar (dir)", x: 62, y: 56.5, w: 12, fs: 6.6 },
  pointsL: { kind: "pipsV", label: "Pontos (esq)", x: 27.1, y: 20.2, w: 2, h: 24.4, fs: 2 },
  pointsR: { kind: "pipsV", label: "Pontos (dir)", x: 70.4, y: 20.2, w: 2, h: 24.4, fs: 2 },
  victoriesL: { kind: "pipsH", label: "Vitórias (esq)", x: 25.6, y: 76.5, w: 5, h: 2, fs: 1.2 },
  victoriesR: { kind: "pipsH", label: "Vitórias (dir)", x: 69.4, y: 76.5, w: 5, h: 2, fs: 1.2 },
  rodada: { kind: "text", label: "Rodada", x: 38.5, y: 76.7, w: 9, fs: 1.8 },
  partida: { kind: "text", label: "Partida", x: 49.7, y: 76.7, w: 10, fs: 1.7 },
  status: { kind: "text", label: "Status", x: 60.4, y: 76.7, w: 11, fs: 1.4 },
  evento: { kind: "text", label: "Evento", x: 15, y: 89, w: 14, fs: 1.05 },
  fase: { kind: "text", label: "Fase", x: 37, y: 89, w: 16, fs: 1.05 },
  local: { kind: "text", label: "Local", x: 56, y: 89, w: 14, fs: 1.05 },
  obs: { kind: "text", label: "Observações", x: 79, y: 89, w: 16, fs: 1.05 },
};

// Winner screen (public/winner-bg.png) fields.
export const WINNER_DEFAULTS: Record<string, FieldDef> = {
  photo: { kind: "img", label: "Foto", x: 10.3, y: 27.3, w: 22.8, h: 36 },
  name: { kind: "text", label: "Nome", x: 22.4, y: 66.4, w: 22.8, fs: 2 },
  scoreWin: { kind: "text", label: "Placar (vencedor)", x: 52.3, y: 39, w: 12, fs: 5.5 },
  scoreLose: { kind: "text", label: "Placar (perdedor)", x: 82.5, y: 39, w: 12, fs: 5.5 },
  ...deckSlotDefs(1, 40.7), ...deckSlotDefs(2, 57.5), ...deckSlotDefs(3, 73.7),
  finishes: { kind: "img", label: "Finishes (caixa)", x: 9.5, y: 72.5, w: 25.5, h: 16.5 },
};

/** One deck position of the winner screen:
 *  - `deckN`: the simple image (BX, BX Expand, UX, UX Expand);
 *  - `deckNCx` / `deckNCxe`: the CX / CX Expand assembly as ONE element each —
 *    only its centre is set here (default: centre of the `deckN` box); sizes,
 *    proportions and the offsets between the pieces are the scoreboard's
 *    assembly of the same system, so they are never configured twice. */
function deckSlotDefs(n: 1 | 2 | 3, x: number): Record<string, FieldDef> {
  const box = { x, y: 56.6, w: 15, h: 26.7 };
  const d = `deck${n}`, L = `Beyblade ${n}`;
  const center = { x: x + box.w / 2, y: box.y + box.h / 2, inherit: d, inheritMode: "center" as const };
  return {
    [d]: { kind: "img", label: `${L} · Imagem simples`, ...box },
    [`${d}Cx`]: { kind: "img", label: `${L} · CX (conjunto)`, ...center, group: "CX" },
    [`${d}Cxe`]: { kind: "img", label: `${L} · CX Expand (conjunto)`, ...center, group: "CX_EXPAND" },
  };
}

/** Elements of each Beyblade format, per board spot (scoreboard side "L"/"R"
 *  or winner deck position "deck1".."deck3"), in drawing order (back → front).
 *  BX/UX is one image; CX 3 pieces; CX Expand 4 pieces (lib/combo-lines). */
export type BeyFormat = "BXUX" | "CX" | "CX_EXPAND";
export function beyFieldKeys(spot: string): Record<BeyFormat, string[]> {
  if (/^deck[123]$/.test(spot)) {
    return {
      BXUX: [spot],
      CX: [`${spot}Cx`],
      CX_EXPAND: [`${spot}Cxe`],
    };
  }
  return {
    BXUX: [`beyImg${spot}`],
    CX: [`cxAssist${spot}`, `cxMetal${spot}`, `cxLock${spot}`],
    CX_EXPAND: [`cxeAssist${spot}`, `cxeMetal${spot}`, `cxeOver${spot}`, `cxeLock${spot}`],
  };
}
/** Format an element belongs to (null = not a Beyblade element). */
export function beyFormatOf(key: string): BeyFormat | null {
  if (/^(beyImg[LR]|deck[123])$/.test(key)) return "BXUX";
  if (/^(cxe(Assist|Metal|Over|Lock)[LR]|deck[123]Cxe)$/.test(key)) return "CX_EXPAND";
  if (/^(cx(Assist|Metal|Lock)[LR]|deck[123]Cx)$/.test(key)) return "CX";
  return null;
}

// Editor targets.
export const TARGETS: Record<string, { label: string; bg: string; defaults: Record<string, FieldDef> }> = {
  scoreboard: { label: "Placar", bg: "/scoreboard-bg.png", defaults: SCOREBOARD_DEFAULTS },
  winner: { label: "Vencedor", bg: "/winner-bg.png", defaults: WINNER_DEFAULTS },
  quickmatch: { label: "Partidas Rápidas", bg: "/scoreboard-bg.png", defaults: SCOREBOARD_DEFAULTS },
};

// Centers (in %) of the dots for a pip group. dir "v" = 5 stacked, "h" = 3 in a row.
export function pipDots(f: Field, dir: "v" | "h"): { cx: number; cy: number }[] {
  const n = dir === "v" ? 5 : 3;
  const out: { cx: number; cy: number }[] = [];
  for (let i = 0; i < n; i++) {
    const cx = dir === "v" ? f.x + (f.w ?? 2) / 2 : f.x + (i * (f.w ?? 5)) / (n - 1);
    const cy = dir === "v" ? f.y + (i * (f.h ?? 24)) / (n - 1) : f.y + (f.h ?? 2) / 2;
    out.push({ cx, cy });
  }
  return out;
}

// Merge saved overrides on top of the defaults for one field. An element never
// saved on its own follows the element it inherits from (see FieldDef.inherit).
export function fieldStyle(defs: Record<string, FieldDef>, key: string, saved: Layout | null | undefined, depth = 0): FieldDef {
  const def = defs[key];
  const ov = saved?.[key];
  if (ov) return { ...def, ...ov };
  if (def?.inherit && depth < 4 && defs[def.inherit]) {
    const { kind: _k, label: _l, inherit: _i, inheritMode: _m, group: _g, ...parent } = fieldStyle(defs, def.inherit, saved, depth + 1);
    if (def.inheritMode === "center") return { ...def, x: parent.x + (parent.w ?? 0) / 2, y: parent.y + (parent.h ?? 0) / 2 };
    return { ...def, ...parent };
  }
  return def;
}

// ── CX / CX Expand assemblies (shared by the scoreboard and the winner) ──
// Both boards are 1672×941, so sizes in % mean the same on both. Drawing
// order (back → front): CX assist → main → lock; CX Expand assist → main →
// over → lock (lib/combo-lines). Each system has its OWN pieces and config.
export type AssemblySystem = "CX" | "CX_EXPAND";
export type AssemblyPiece = "assist" | "metal" | "over" | "lock";
export const ASSEMBLY_PIECES: Record<AssemblySystem, AssemblyPiece[]> = {
  CX: ["assist", "metal", "lock"],
  CX_EXPAND: ["assist", "metal", "over", "lock"],
};
const PIECE_KEY: Record<AssemblySystem, Record<AssemblyPiece, string>> = {
  CX: { assist: "cxAssist", metal: "cxMetal", over: "", lock: "cxLock" },
  CX_EXPAND: { assist: "cxeAssist", metal: "cxeMetal", over: "cxeOver", lock: "cxeLock" },
};
export const PIECE_LABEL: Record<AssemblyPiece, string> = { assist: "Assist Blade", metal: "Main Blade", over: "Over Blade", lock: "Lock Chip" };
/** Scoreboard element keys of a system's pieces on one side, back → front. */
export function assemblyKeys(system: AssemblySystem, side: "L" | "R"): string[] {
  return ASSEMBLY_PIECES[system].map((p) => `${PIECE_KEY[system][p]}${side}`);
}
export type PieceBox = { piece: AssemblyPiece; key: string; x: number; y: number; w: number; h: number };
/** @deprecated name kept for callers: the CX pieces. */
export const CX_PIECES = ASSEMBLY_PIECES.CX;
export type CxPiece = AssemblyPiece;

/** The pieces of one system on one scoreboard side as configured there
 *  (saved or default): absolute boxes, the bounding box and its centre. */
export function assemblyOf(system: AssemblySystem, sbLayout: Layout | null | undefined, side: "L" | "R") {
  const boxes: PieceBox[] = ASSEMBLY_PIECES[system].map((piece) => {
    const key = `${PIECE_KEY[system][piece]}${side}`;
    const f = fieldStyle(SCOREBOARD_DEFAULTS, key, sbLayout);
    return { piece, key, x: f.x, y: f.y, w: f.w ?? 12.5, h: f.h ?? 22.2 };
  });
  const minX = Math.min(...boxes.map((b) => b.x)), minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w)), maxY = Math.max(...boxes.map((b) => b.y + b.h));
  return { boxes, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

/**
 * Boxes of a system's pieces to draw. Without `center`: exactly where the
 * scoreboard puts them. With `center` (winner screen): the SAME sizes and
 * the same offsets between the pieces, the whole assembly moved so that its
 * centre lands on `center` — never the scoreboard's absolute coordinates.
 */
export function assemblyBoxes(system: AssemblySystem, sbLayout: Layout | null | undefined, side: "L" | "R", center?: { x: number; y: number }): PieceBox[] {
  const a = assemblyOf(system, sbLayout, side);
  if (!center) return a.boxes;
  const dx = center.x - a.cx, dy = center.y - a.cy;
  return a.boxes.map((b) => ({ ...b, x: b.x + dx, y: b.y + dy }));
}
export const cxAssembly = (sbLayout: Layout | null | undefined, side: "L" | "R") => assemblyOf("CX", sbLayout, side);
export const cxBoxes = (sbLayout: Layout | null | undefined, side: "L" | "R", center?: { x: number; y: number }) => assemblyBoxes("CX", sbLayout, side, center);
