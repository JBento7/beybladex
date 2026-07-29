// Shared layout config for the arena scoreboard. The visual editor (admin) saves
// per-field positions/sizes here and the arena display reads them, falling back
// to these defaults. All values are percentages of the 1672×941 board.
//
// - text fields: x/y are the CENTER; w is max width (%); fs is font size (cqw).
// - img fields:  x/y are the TOP-LEFT; w/h are the size (%).

// pipsV = 5 dots stacked vertically (PONTOS); pipsH = 3 dots in a row (VITÓRIAS).
// For pip fields the box (x,y,w,h) is the group extent and fs is the dot diameter (cqw).
export type FieldKind = "text" | "img" | "pipsV" | "pipsH";
export type Field = { x: number; y: number; w?: number; h?: number; fs?: number };
export type FieldDef = Field & { kind: FieldKind; label: string };
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
  beyImgL: { kind: "img", label: "Bey foto (esq)", x: 7.1, y: 57.7, w: 12.5, h: 22.2 },
  beyImgR: { kind: "img", label: "Bey foto (dir)", x: 79.84, y: 57.7, w: 12.5, h: 22.2 },
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
  deck1: { kind: "img", label: "Bey 1", x: 40.7, y: 56.6, w: 15, h: 26.7 },
  deck2: { kind: "img", label: "Bey 2", x: 57.5, y: 56.6, w: 15, h: 26.7 },
  deck3: { kind: "img", label: "Bey 3", x: 73.7, y: 56.6, w: 15, h: 26.7 },
  finishes: { kind: "img", label: "Finishes (caixa)", x: 9.5, y: 72.5, w: 25.5, h: 16.5 },
};

// Editor targets.
export const TARGETS: Record<string, { label: string; bg: string; defaults: Record<string, FieldDef> }> = {
  scoreboard: { label: "Placar", bg: "/scoreboard-bg.png", defaults: SCOREBOARD_DEFAULTS },
  winner: { label: "Vencedor", bg: "/winner-bg.png", defaults: WINNER_DEFAULTS },
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

// Merge saved overrides on top of the defaults for one field.
export function fieldStyle(defs: Record<string, FieldDef>, key: string, saved: Layout | null | undefined): FieldDef {
  const def = defs[key];
  const ov = saved?.[key];
  return ov ? { ...def, ...ov } : def;
}
