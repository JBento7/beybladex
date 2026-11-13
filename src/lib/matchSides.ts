// Which player the scoreboard shows on the LEFT (docs/JUIZ-TELAO.md): the B
// side on the left, the X side on the right; in multi-set matches the
// players swap sides every set (set 2, 4… swapped). Without chosen sides,
// player 1 is on the left. Pure: shared by the telão route and tests.

export type SideInput = { player1Id: string; player2Id: string; xSidePlayerId: string | null; maxSets: number };

export function leftPlayerId(m: SideInput, setNumber: number): string {
  if (!m.xSidePlayerId) return m.player1Id;
  const bId = m.xSidePlayerId === m.player1Id ? m.player2Id : m.player1Id;
  const swap = m.maxSets > 1 && setNumber % 2 === 0;
  return swap ? m.xSidePlayerId : bId;
}

/** Side ("L"/"R") a player was shown on during the LAST set played — the
 *  reference for the winner screen's CX (its sizes come from that side). */
export function scoreboardSideOf(m: SideInput, playerId: string, sets: { setNumber: number }[]): "L" | "R" {
  const last = sets.length ? Math.max(...sets.map((s) => s.setNumber)) : 1;
  return leftPlayerId(m, last) === playerId ? "L" : "R";
}

// ── Sides of the players (both judging modes; docs/JUIZ-TELAO.md §5) ──
// `xSidePlayerId` = the player on the X side in SET 1 (the other is on the B
// side). The B side is the telão's LEFT; the judge faces the players, so the
// judge panel is its mirror (B side on the judge's RIGHT). In multi-set
// matches the players swap sides at every new set.

/** Player on the B side during `setNumber` (null = sides not chosen). */
export function bSidePlayerInSet(m: SideInput, setNumber: number): string | null {
  return m.xSidePlayerId ? leftPlayerId(m, setNumber) : null;
}
/** "B" / "X" of a player during `setNumber` (null = sides not chosen). */
export function sideOfPlayer(m: SideInput, playerId: string, setNumber: number): "B" | "X" | null {
  const b = bSidePlayerInSet(m, setNumber);
  return b ? (b === playerId ? "B" : "X") : null;
}
/** Player shown on the judge panel's LEFT column (the X side, mirror of the
 *  telão). Without chosen sides: player 1. */
export function judgeLeftPlayerId(m: SideInput, setNumber: number): string {
  if (!m.xSidePlayerId) return m.player1Id;
  const b = leftPlayerId(m, setNumber);
  return b === m.player1Id ? m.player2Id : m.player1Id;
}
/** The players changed sides when `setNumber` began (set 2, 3… of a
 *  multi-set match with chosen sides). */
export function sidesSwappedAt(m: SideInput, setNumber: number): boolean {
  return !!m.xSidePlayerId && m.maxSets > 1 && setNumber > 1;
}
/**
 * The stored `xSidePlayerId` for "this player starts on the B side in
 * `setNumber`" — so a choice made in a later set (a match that started
 * without sides) means exactly what the judge saw, and earlier sets are
 * never rewritten.
 */
export function xSideForBInSet(m: Omit<SideInput, "xSidePlayerId">, bPlayerId: string, setNumber: number): string {
  const other = bPlayerId === m.player1Id ? m.player2Id : m.player1Id;
  const swapped = m.maxSets > 1 && setNumber % 2 === 0;
  return swapped ? bPlayerId : other;
}

/**
 * When the sides may be chosen or changed:
 *  - before the first battle: free (choose or correct);
 *  - match under way WITHOUT sides (older matches): once, at a safe moment,
 *    applying from the current set — never rewriting points or winners;
 *  - sides already set after the first battle, or a finished match: blocked.
 */
export function sidesEditable(m: { status: string; battlesPlayed: number; xSidePlayerId: string | null }): { ok: true; firstTime: boolean } | { ok: false; reason: string } {
  if (m.status === "FINISHED") return { ok: false, reason: "Partida finalizada: os lados não podem mais ser alterados." };
  if (m.battlesPlayed === 0) return { ok: true, firstTime: !m.xSidePlayerId };
  if (!m.xSidePlayerId) return { ok: true, firstTime: true };
  return { ok: false, reason: "A partida já começou com os lados definidos: eles não podem mais ser trocados." };
}
