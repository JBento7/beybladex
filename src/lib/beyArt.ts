// Pieces of a REAL player's Beyblade for the telão (docs/EDITOR-LAYOUT.md §
// Beyblades). Pure (the catalog lookup is injected): unit-tested. The format
// decides the pieces (lib/combo-lines): CX = lock chip + main (metal) blade +
// assist blade; CX Expand = the same + over blade. BX/UX = one blade image.
// Only the player's own parts are looked up — never demonstration images.

export type BeyLike = {
  beyLine?: string | null; blade?: string | null; lockChip?: string | null;
  metalBlade?: string | null; assistBlade?: string | null; overBlade?: string | null;
};
export type PiecesData = { kind: "CX" | "CX_EXPAND"; lock: string | null; metal: string | null; assist: string | null; over: string | null };
export type PartLookup = (category: string, name: string | null) => Promise<string | null>;

export const isCX = (b: BeyLike | null | undefined) => !!b && (b.beyLine === "CX" || b.beyLine === "CX_EXPAND");

/** Name whose art represents the whole bey (BX/UX blade; CX over/main blade). */
export function mainBladeName(b: BeyLike | null): string | null {
  if (!b) return null;
  return (isCX(b) ? b.overBlade || b.metalBlade : b.blade) ?? null;
}

/** CX / CX Expand pieces with their catalog images; null for BX/UX or when
 *  none of the pieces has an image (the caller then uses the blade art). */
export async function beyPiecesOf(b: BeyLike | null, lookup: PartLookup): Promise<PiecesData | null> {
  if (!b || !isCX(b)) return null;
  const expand = b.beyLine === "CX_EXPAND";
  const [lock, metal, assist, over] = await Promise.all([
    lookup("LOCK_CHIP", b.lockChip ?? null),
    lookup("MAIN_BLADE", b.metalBlade ?? null),
    lookup("ASSIST_BLADE", b.assistBlade ?? null),
    expand ? lookup("OVER_BLADE", b.overBlade ?? null) : Promise.resolve(null),
  ]);
  if (!lock && !metal && !assist && !over) return null;
  return { kind: expand ? "CX_EXPAND" : "CX", lock, metal, assist, over };
}
