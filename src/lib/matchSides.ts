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
