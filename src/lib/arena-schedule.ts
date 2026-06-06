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

  // Each slot tracks which players are assigned and which arenas are taken
  const slots: { players: Set<string>; arenas: Set<number> }[] = [];
  // Total matches assigned to each arena so far, to keep load balanced
  const arenaLoad = new Array<number>(arenaCount + 1).fill(0);

  // Picks the least-loaded free arena for a given slot
  function pickArena(takenArenas: Set<number>): number {
    let best = -1;
    for (let a = 1; a <= arenaCount; a++) {
      if (takenArenas.has(a)) continue;
      if (best === -1 || arenaLoad[a] < arenaLoad[best]) best = a;
    }
    return best;
  }

  return matches.map((m) => {
    const p1 = getP1(m);
    const p2 = getP2(m);

    for (let s = 0; s < slots.length; s++) {
      const slot = slots[s];
      if (!slot.players.has(p1) && !slot.players.has(p2) && slot.arenas.size < arenaCount) {
        const arena = pickArena(slot.arenas);
        slot.players.add(p1);
        slot.players.add(p2);
        slot.arenas.add(arena);
        arenaLoad[arena]++;
        return { match: m, slot: s, arena };
      }
    }

    // No existing slot works — open a new one, picking the least-loaded arena overall
    const arena = pickArena(new Set());
    slots.push({ players: new Set([p1, p2]), arenas: new Set([arena]) });
    arenaLoad[arena]++;
    return { match: m, slot: slots.length - 1, arena };
  });
}
