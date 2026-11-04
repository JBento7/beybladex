// Editing operations on a Beyblade assembly (a list of piece boxes of one
// system on one side — docs/EDITOR-LAYOUT.md § Beyblades). Pure (no imports):
// unit-tested, used by the layout editor. Every operation returns NEW fields
// for the given keys only: other systems and sides are never touched.

export type Box = { x: number; y: number; w?: number; h?: number };
export type Fields = Record<string, Box>;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Bounding box of the pieces (top-left, size, centre). */
export function bbox(fields: Fields, keys: string[]) {
  const bs = keys.map((k) => fields[k]).filter(Boolean);
  const minX = Math.min(...bs.map((b) => b.x)), minY = Math.min(...bs.map((b) => b.y));
  const maxX = Math.max(...bs.map((b) => b.x + (b.w ?? 0))), maxY = Math.max(...bs.map((b) => b.y + (b.h ?? 0)));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

/** Moves every piece by the same amount: the assembly stays intact. */
export function moveAssembly(fields: Fields, keys: string[], dx: number, dy: number): Fields {
  const out: Fields = {};
  for (const k of keys) if (fields[k]) out[k] = { ...fields[k], x: r2(fields[k].x + dx), y: r2(fields[k].y + dy) };
  return out;
}

/**
 * Scales the assembly around ONE common centre (default: its bounding-box
 * centre): every piece's position relative to that centre and its size are
 * multiplied by the same factor — offsets and proportions between the pieces
 * are kept, the Beyblade never comes apart.
 */
export function scaleAssembly(fields: Fields, keys: string[], factor: number, center?: { x: number; y: number }): Fields {
  const f = Math.max(0.05, factor);
  const c = center ?? (() => { const b = bbox(fields, keys); return { x: b.cx, y: b.cy }; })();
  const out: Fields = {};
  for (const k of keys) {
    const b = fields[k];
    if (!b) continue;
    out[k] = { ...b, x: r2(c.x + (b.x - c.x) * f), y: r2(c.y + (b.y - c.y) * f), w: r2((b.w ?? 0) * f), h: r2((b.h ?? 0) * f) };
  }
  return out;
}

/**
 * "Copiar para o outro lado": the target assembly gets the source's sizes and
 * montage (same offsets between pieces — the piece images are not mirrored,
 * so the montage must not be either) at the horizontally MIRRORED position of
 * the whole set. `src[i]` maps to `dst[i]`.
 */
export function mirrorAssembly(fields: Fields, src: string[], dst: string[]): Fields {
  const b = bbox(fields, src);
  const dx = (100 - b.x - b.w) - b.x;
  const out: Fields = {};
  src.forEach((k, i) => { if (fields[k] && dst[i]) out[dst[i]] = { ...fields[k], x: r2(fields[k].x + dx) }; });
  return out;
}

/** Copies boxes as they are (`pairs`: [from, to]) — e.g. "Copiar montagem do
 *  CX" into CX Expand. The copies are independent afterwards. */
export function copyBoxes(fields: Fields, pairs: [string, string][]): Fields {
  const out: Fields = {};
  for (const [from, to] of pairs) if (fields[from]) out[to] = { ...fields[from] };
  return out;
}
