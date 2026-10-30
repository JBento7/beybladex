// Layout compositions of the arena screens (docs/EDITOR-LAYOUT.md): the unit
// that is drafted, published, versioned and read by the telões. Pure helpers
// (validation, legacy migration, history, snapping, diff); the field defaults
// (lib/arenaLayout) are passed in, so this file has no imports and is
// unit-tested directly by Node (tests/layoutDoc.test.ts).

export type Field = { x: number; y: number; w?: number; h?: number; fs?: number; ff?: string };
export type FieldKind = "text" | "img" | "pipsV" | "pipsH";
export type FieldDefLike = Field & { kind: FieldKind; label: string };
export type Defs = Record<string, FieldDefLike>;
export type FontDef = { family: string; kind: "upload" | "google"; src?: string };
export type CustomMeta = { key: string; label: string; type: "text" | "int"; value: string };

export const SCREENS = ["scoreboard", "winner", "quickmatch"] as const;
export type Screen = (typeof SCREENS)[number];
export const SCREEN_LABEL: Record<Screen, string> = { scoreboard: "Placar", winner: "Vencedor", quickmatch: "Partida rápida" };

/**
 * Everything a screen needs, published as ONE unit:
 *  - fields: geometry/font of every element (standard + custom), in % of the
 *    1672×941 board (text: x/y = centre; images/pips: x/y = top-left);
 *  - hidden: elements not shown on the telão;
 *  - customs: custom field meta (scoreboard);
 *  - bg: background (null = the default art; quickmatch: null = the Placar's);
 *  - fonts: definitions of the fonts this screen uses;
 *  - locked / keepRatio: editor-only (never change what the telão shows).
 */
export type Composition = {
  fields: Record<string, Field>;
  hidden: string[];
  customs: CustomMeta[];
  bg: string | null;
  fonts: FontDef[];
  locked: string[];
  keepRatio: string[];
};

export const isCustomKey = (k: string) => /^custom_\d+$/.test(k);
export const isScreen = (v: unknown): v is Screen => typeof v === "string" && (SCREENS as readonly string[]).includes(v);

// ── Limits (also enforced by the server) ──
export const LIMITS = {
  pos: { min: -20, max: 120 },
  size: { min: 0.5, max: 100 },
  fs: { min: 0.2, max: 30 },
  customs: 30,
  label: 40,
  value: 60,
  fonts: 30,
  family: 60,
  fontBytes: 3_000_000,
  bgBytes: 8_000_000,
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Normalized field (rounded, clamped) or null when a value is not a finite number. */
export function normalizeField(f: unknown): Field | null {
  if (!f || typeof f !== "object") return null;
  const o = f as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const x = num(o.x), y = num(o.y);
  if (x === null || y === null) return null;
  const out: Field = { x: r2(clamp(x, LIMITS.pos.min, LIMITS.pos.max)), y: r2(clamp(y, LIMITS.pos.min, LIMITS.pos.max)) };
  for (const k of ["w", "h"] as const) {
    if (o[k] === undefined || o[k] === null) continue;
    const v = num(o[k]);
    if (v === null) return null;
    out[k] = r2(clamp(v, LIMITS.size.min, LIMITS.size.max));
  }
  if (o.fs !== undefined && o.fs !== null) {
    const v = num(o.fs);
    if (v === null) return null;
    out.fs = r2(clamp(v, LIMITS.fs.min, LIMITS.fs.max));
  }
  if (typeof o.ff === "string" && o.ff) out.ff = o.ff.slice(0, LIMITS.family);
  return out;
}

const validFamily = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0 && s.length <= LIMITS.family && !/['"<>;{}\\]/.test(s);

/**
 * Server-side validation of a composition for a screen: allowed keys, types,
 * limits and references (fonts used must be defined; hidden/locked keys must
 * exist). Returns the normalized composition or the list of problems.
 */
export function validateComposition(screen: Screen, input: unknown, defs: Defs): { ok: true; value: Composition } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const c = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;

  const customsIn = Array.isArray(c.customs) ? c.customs : [];
  if (customsIn.length > LIMITS.customs) errors.push(`No máximo ${LIMITS.customs} campos personalizados.`);
  const customs: CustomMeta[] = [];
  if (screen === "scoreboard") {
    for (const raw of customsIn.slice(0, LIMITS.customs)) {
      const m = (raw ?? {}) as Record<string, unknown>;
      const key = String(m.key ?? "");
      const type = m.type === "int" ? "int" : m.type === "text" ? "text" : null;
      const label = typeof m.label === "string" ? m.label.trim() : "";
      const value = typeof m.value === "string" ? m.value : String(m.value ?? "");
      if (!isCustomKey(key)) { errors.push(`Campo personalizado com identificador inválido (${key || "vazio"}).`); continue; }
      if (!type) { errors.push(`Campo "${label || key}": tipo inválido.`); continue; }
      if (!label || label.length > LIMITS.label) { errors.push(`Campo "${key}": nome obrigatório (até ${LIMITS.label} caracteres).`); continue; }
      if (value.length > LIMITS.value || (type === "int" && !/^-?\d*$/.test(value))) { errors.push(`Campo "${label}": valor inválido.`); continue; }
      if (customs.some((x) => x.key === key)) { errors.push(`Campo "${key}" repetido.`); continue; }
      customs.push({ key, label, type, value });
    }
  } else if (customsIn.length) {
    errors.push("Campos personalizados só existem no Placar.");
  }
  const known = new Set([...Object.keys(defs), ...customs.map((x) => x.key)]);

  const fields: Record<string, Field> = {};
  const fieldsIn = (c.fields && typeof c.fields === "object" ? c.fields : {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(fieldsIn)) {
    if (!known.has(k)) { errors.push(`Elemento desconhecido: ${k}.`); continue; }
    const n = normalizeField(v);
    if (!n) { errors.push(`Elemento ${defs[k]?.label ?? k}: valores numéricos inválidos.`); continue; }
    fields[k] = n;
  }
  for (const k of customs.map((x) => x.key)) if (!fields[k]) fields[k] = { x: 50, y: 50, w: 14, fs: 1.8 };

  const keyList = (v: unknown, name: string) => {
    if (v === undefined) return [];
    if (!Array.isArray(v)) { errors.push(`${name}: formato inválido.`); return []; }
    const out: string[] = [];
    for (const k of v) {
      if (typeof k !== "string" || !known.has(k)) { errors.push(`${name}: elemento desconhecido (${String(k)}).`); continue; }
      if (!out.includes(k)) out.push(k);
    }
    return out;
  };
  const hidden = keyList(c.hidden, "Visibilidade");
  const locked = keyList(c.locked, "Bloqueio");
  const keepRatio = keyList(c.keepRatio, "Proporção");

  let bg: string | null = null;
  if (c.bg !== undefined && c.bg !== null && c.bg !== "") {
    if (typeof c.bg !== "string") errors.push("Fundo inválido.");
    else if (c.bg.length > LIMITS.bgBytes) errors.push("Imagem de fundo grande demais.");
    else if (!/^(\/[\w\-./]+|https:\/\/\S+|data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+)$/.test(c.bg)) errors.push("Fundo inválido: use uma imagem enviada pelo editor.");
    else bg = c.bg;
  }

  const fonts: FontDef[] = [];
  const fontsIn = Array.isArray(c.fonts) ? c.fonts : [];
  if (fontsIn.length > LIMITS.fonts) errors.push(`No máximo ${LIMITS.fonts} fontes.`);
  for (const raw of fontsIn.slice(0, LIMITS.fonts)) {
    const f = (raw ?? {}) as Record<string, unknown>;
    if (!validFamily(f.family)) { errors.push("Fonte com nome inválido."); continue; }
    if (f.kind === "google") fonts.push({ family: f.family.trim(), kind: "google" });
    else if (f.kind === "upload") {
      if (typeof f.src !== "string" || f.src.length > LIMITS.fontBytes || !/^data:(font\/[\w.+-]+|application\/(font-[\w]+|x-font-[\w]+|octet-stream|vnd\.ms-fontobject));base64,/.test(f.src)) {
        errors.push(`Fonte "${f.family}": arquivo inválido ou grande demais.`);
        continue;
      }
      fonts.push({ family: f.family.trim(), kind: "upload", src: f.src });
    } else errors.push(`Fonte "${String(f.family)}": tipo inválido.`);
  }
  const families = new Set(fonts.map((f) => f.family));
  for (const [k, f] of Object.entries(fields)) {
    if (f.ff && !families.has(f.ff)) errors.push(`Elemento ${defs[k]?.label ?? k}: a fonte "${f.ff}" não está definida.`);
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { fields, hidden, customs, bg, fonts, locked, keepRatio } };
}

/** Fonts actually used by a composition's fields (subset of a library). */
export function fontsUsed(fields: Record<string, Field>, library: FontDef[]): FontDef[] {
  const used = new Set(Object.values(fields).map((f) => f.ff).filter((x): x is string => !!x));
  return library.filter((f) => used.has(f.family));
}

/**
 * Composition from the legacy storage (separate ArenaLayout keys), so old
 * layouts keep EXACTLY their look: saved overrides on top of the defaults.
 */
export function fromLegacy(screen: Screen, legacy: { layout?: unknown; hidden?: unknown; customs?: unknown; bg?: unknown; fonts?: unknown }, defs: Defs): Composition {
  const saved = (legacy.layout && typeof legacy.layout === "object" ? legacy.layout : {}) as Record<string, unknown>;
  const fields: Record<string, Field> = {};
  for (const k of Object.keys(defs)) {
    const { kind: _k, label: _l, ...def } = defs[k];
    const merged = normalizeField({ ...def, ...(saved[k] && typeof saved[k] === "object" ? (saved[k] as object) : {}) });
    fields[k] = merged ?? (def as Field);
  }
  const customs: CustomMeta[] = [];
  if (screen === "scoreboard" && Array.isArray(legacy.customs)) {
    for (const raw of legacy.customs) {
      const c = (raw ?? {}) as Record<string, unknown>;
      if (!isCustomKey(String(c.key))) continue;
      customs.push({ key: String(c.key), label: String(c.label ?? c.key).slice(0, LIMITS.label), type: c.type === "int" ? "int" : "text", value: String(c.value ?? "").slice(0, LIMITS.value) });
      fields[String(c.key)] = normalizeField(c) ?? { x: 50, y: 50, w: 14, fs: 1.8 };
    }
  }
  const known = new Set(Object.keys(fields));
  const hidden = Array.isArray(legacy.hidden) ? (legacy.hidden as unknown[]).filter((k): k is string => typeof k === "string" && known.has(k)) : [];
  const bgObj = (legacy.bg && typeof legacy.bg === "object" ? legacy.bg : {}) as Record<string, unknown>;
  const bg = typeof bgObj.url === "string" && bgObj.url ? bgObj.url : null;
  const library = Array.isArray(legacy.fonts) ? (legacy.fonts as FontDef[]).filter((f) => f && validFamily(f.family)) : [];
  // Elements start unlocked; visibility exactly as it was.
  return { fields, hidden, customs, bg, fonts: fontsUsed(fields, library), locked: [], keepRatio: [] };
}

/** Elements whose geometry/font/visibility differ, plus meta changes. */
// Compared value by value: the database (JSONB) does not keep key order, so
// two equal compositions can serialize differently.
const FIELD_PROPS = ["x", "y", "w", "h", "fs", "ff"] as const;
export function sameField(p?: Field, q?: Field): boolean {
  if (!p || !q) return !p && !q;
  return FIELD_PROPS.every((k) => (p[k] ?? null) === (q[k] ?? null));
}
const customsKey = (cs: CustomMeta[]) => cs.map((c) => `${c.key}|${c.label}|${c.type}|${c.value}`).join("\n");
const fontsKey = (fs: FontDef[]) => fs.map((f) => `${f.family}|${f.kind}|${f.src ?? ""}`).sort().join("\n");

export function diffCompositions(a: Composition, b: Composition): { changed: string[]; meta: string[] } {
  const keys = new Set([...Object.keys(a.fields), ...Object.keys(b.fields)]);
  const changed: string[] = [];
  const same = sameField;
  const ha = new Set(a.hidden), hb = new Set(b.hidden);
  for (const k of keys) if (!same(a.fields[k], b.fields[k]) || ha.has(k) !== hb.has(k)) changed.push(k);
  const meta: string[] = [];
  if ((a.bg ?? "") !== (b.bg ?? "")) meta.push("Fundo");
  if (customsKey(a.customs) !== customsKey(b.customs)) meta.push("Campos personalizados");
  if (fontsKey(a.fonts) !== fontsKey(b.fonts)) meta.push("Fontes");
  return { changed: changed.sort(), meta };
}

export function sameComposition(a: Composition, b: Composition): boolean {
  const d = diffCompositions(a, b);
  return d.changed.length === 0 && d.meta.length === 0 && JSON.stringify([...a.locked].sort()) === JSON.stringify([...b.locked].sort()) && JSON.stringify([...a.keepRatio].sort()) === JSON.stringify([...b.keepRatio].sort());
}

// ── Undo / redo (one history per screen) ──
export type History<T> = { past: T[]; future: T[] };
export const emptyHistory = <T>(): History<T> => ({ past: [], future: [] });
const HISTORY_CAP = 100;
/** Record `before` as an undo step (a new edit drops the redo path). */
export function record<T>(h: History<T>, before: T): History<T> {
  return { past: [...h.past, before].slice(-HISTORY_CAP), future: [] };
}
export function undo<T>(h: History<T>, current: T): { h: History<T>; value: T } | null {
  if (!h.past.length) return null;
  const value = h.past[h.past.length - 1];
  return { h: { past: h.past.slice(0, -1), future: [current, ...h.future] }, value };
}
export function redo<T>(h: History<T>, current: T): { h: History<T>; value: T } | null {
  if (!h.future.length) return null;
  const [value, ...rest] = h.future;
  return { h: { past: [...h.past, current].slice(-HISTORY_CAP), future: rest }, value };
}

// ── Geometry helpers ──
/** The counterpart key on the other side (nameL ↔ nameR…). */
export function pairKey(key: string): string | null {
  if (/L$/.test(key)) return key.slice(0, -1) + "R";
  if (/R$/.test(key)) return key.slice(0, -1) + "L";
  return null;
}
/** Horizontal mirror: text is centre-anchored (x' = 100 − x); boxes are left-anchored (x' = 100 − x − w). */
export function mirrorField(kind: FieldKind, f: Field): Field {
  return { ...f, x: r2(kind === "text" ? 100 - f.x : 100 - f.x - (f.w ?? 0)) };
}
/** Anchor lines of an element (x: left/centre/right; y: top/centre/bottom) in %. */
export function anchors(kind: FieldKind, f: Field): { x: number[]; y: number[] } {
  if (kind === "text") return { x: [f.x], y: [f.y] };
  const w = f.w ?? 0, h = f.h ?? 0;
  return { x: [f.x, f.x + w / 2, f.x + w], y: [f.y, f.y + h / 2, f.y + h] };
}
/**
 * Snap a moving element: the closest of its anchors to any target line within
 * `threshold` (%) moves onto it. Returns the corrected position and the guides.
 */
export function snapMove(kind: FieldKind, f: Field, targets: { x: number[]; y: number[] }, threshold = 0.6): { x: number; y: number; guides: { x: number | null; y: number | null } } {
  const a = anchors(kind, f);
  const best = (own: number[], lines: number[]) => {
    let pick: { delta: number; line: number } | null = null;
    for (const o of own) for (const l of lines) {
      const d = l - o;
      if (Math.abs(d) <= threshold && (!pick || Math.abs(d) < Math.abs(pick.delta))) pick = { delta: d, line: l };
    }
    return pick;
  };
  const bx = best(a.x, targets.x), by = best(a.y, targets.y);
  return { x: r2(f.x + (bx?.delta ?? 0)), y: r2(f.y + (by?.delta ?? 0)), guides: { x: bx?.line ?? null, y: by?.line ?? null } };
}
/** Centre horizontally / vertically on the board. */
export function centered(kind: FieldKind, f: Field, axis: "h" | "v"): Field {
  if (axis === "h") return { ...f, x: kind === "text" ? 50 : r2(50 - (f.w ?? 0) / 2) };
  return { ...f, y: kind === "text" ? 50 : r2(50 - (f.h ?? 0) / 2) };
}
/** New size keeping the width/height proportion of `orig`. */
export function resizeKeepRatio(orig: Field, newW: number): { w: number; h: number } {
  const ratio = orig.w && orig.h ? orig.h / orig.w : 1;
  const w = r2(clamp(newW, LIMITS.size.min, LIMITS.size.max));
  return { w, h: r2(clamp(w * ratio, LIMITS.size.min, LIMITS.size.max)) };
}

/** "Restaurar padrão desta tela": standard elements back to their default
 *  geometry/font and visible; custom fields, background and fonts kept. */
export function restoreDefaults(comp: Composition, defs: Defs): Composition {
  const fields = { ...comp.fields };
  for (const k of Object.keys(defs)) {
    const { kind: _k, label: _l, ...def } = defs[k];
    fields[k] = { ...(def as Field) };
  }
  return { ...comp, fields, hidden: comp.hidden.filter(isCustomKey), locked: comp.locked.filter(isCustomKey) };
}

// ── Layer groups (editor list) ──
export type LayerGroup = "left" | "right" | "score" | "event" | "custom" | "winner";
export const GROUP_LABEL: Record<LayerGroup, string> = {
  left: "Jogador esquerdo", right: "Jogador direito", score: "Pontuação e sets", event: "Informações do evento", custom: "Campos personalizados", winner: "Vencedor",
};
export function groupOf(screen: Screen, key: string): LayerGroup {
  if (isCustomKey(key)) return "custom";
  if (screen === "winner") return ["scoreWin", "scoreLose"].includes(key) ? "score" : "winner";
  if (/^(score|points|victories)[LR]$/.test(key) || ["rodada", "partida", "status"].includes(key)) return "score";
  if (["evento", "fase", "local", "obs"].includes(key)) return "event";
  return key.endsWith("L") ? "left" : key.endsWith("R") ? "right" : "event";
}
