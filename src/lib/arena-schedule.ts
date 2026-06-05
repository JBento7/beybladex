/**
 * Distributes matches across arenas ensuring no player appears in two arenas
 * in the same parallel "slot" (time step).
 *
 * Returns each match annotated with a slot index (row) and arena number (column).
 * Matches within the same slot can run simultaneously without player conflicts.
 */
export function scheduleByArena<T>(
  matches: T[],
  arenaCount: number,
  getP1: (m: T) => string,
  getP2: (m: T) => string,
): Array<{ match: T; slot: number; arena: number }> {
  if (arenaCount <= 1) {
    return matches.map((m, i) => ({ match: m, slot: i, arena: 1 }));
  }

  // Each slot tracks which players are already assigned and how many arenas are taken
  const slots: { players: Set<string>; count: number }[] = [];

  return matches.map((m) => {
    const p1 = getP1(m);
    const p2 = getP2(m);

    for (let s = 0; s < slots.length; s++) {
      const slot = slots[s];
      if (!slot.players.has(p1) && !slot.players.has(p2) && slot.count < arenaCount) {
        const arena = slot.count + 1;
        slot.players.add(p1);
        slot.players.add(p2);
        slot.count++;
        return { match: m, slot: s, arena };
      }
    }

    // No existing slot works — open a new one
    slots.push({ players: new Set([p1, p2]), count: 1 });
    return { match: m, slot: slots.length - 1, arena: 1 };
  });
}
