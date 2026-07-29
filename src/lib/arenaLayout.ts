// Shared layout config for the arena scoreboard. The visual editor (admin) saves
// per-field positions/sizes here and the arena display reads them, falling back
// to these defaults. All values are percentages of the 1672×941 board.
//
// - text fields: x/y are the CENTER; w is max width (%); fs is font size (cqw).
// - img fields:  x/y are the TOP-LEFT; w/h are the size (%).

export type FieldKind = "text" | "img";
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
  rodada: { kind: "text", label: "Rodada", x: 38.5, y: 76.7, w: 9, fs: 1.8 },
  partida: { kind: "text", label: "Partida", x: 49.7, y: 76.7, w: 10, fs: 1.7 },
  status: { kind: "text", label: "Status", x: 60.4, y: 76.7, w: 11, fs: 1.4 },
  evento: { kind: "text", label: "Evento", x: 15, y: 89, w: 14, fs: 1.05 },
  fase: { kind: "text", label: "Fase", x: 37, y: 89, w: 16, fs: 1.05 },
  local: { kind: "text", label: "Local", x: 56, y: 89, w: 14, fs: 1.05 },
  obs: { kind: "text", label: "Observações", x: 79, y: 89, w: 16, fs: 1.05 },
};

// Merge saved overrides on top of the defaults for one field.
export function fieldStyle(key: string, saved: Layout | null | undefined): FieldDef {
  const def = SCOREBOARD_DEFAULTS[key];
  const ov = saved?.[key];
  return ov ? { ...def, ...ov } : def;
}
