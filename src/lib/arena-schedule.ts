/**
 * Distributes matches across arenas ensuring no player appears in two arenas
 * in the same parallel "slot" (time step).
 *
 * When a judge pool is supplied, each match is also assigned a judge from the
 * pool such that, within a single slot, no person is busy in more than one
 * role at a time: a judge never referees a match in the same slot they're
 * playing in, and never referees two matches simultaneously. This guarantees
 * that judges who are also competing don't have a parallel match while they're
 * arbitrating one.
 *
 * Returns each match annotated with a slot index (row), arena number (column),
 * and the assigned judge's userId (or null when no judge could be assigned /
 * the pool is empty).
 */
export function scheduleByArena<T>(
  matches: T[],
  arenaCount: number,
  getP1: (m: T) => string,
  getP2: (m: T) => string,
  judges: string[] = [],
): Array<{ match: T; slot: number; arena: number; judgeId: string | null }> {
  const hasJudges = judges.length > 0;

  // Each slot tracks who is busy (playing OR judging) and which arenas are taken
  const slots: { busy: Set<string>; arenas: Set<number> }[] = [];
  // Total matches assigned to each arena so far, to keep load balanced
  const arenaLoad = new Array<number>(arenaCount + 1).fill(0);
  // How many matches each judge has been assigned, to balance their workload
  const judgeLoad = new Map<string, number>();
  for (const j of judges) judgeLoad.set(j, 0);

  // Picks the least-loaded free arena for a given slot
  function pickArena(takenArenas: Set<number>): number {
    let best = -1;
    for (let a = 1; a <= arenaCount; a++) {
      if (takenArenas.has(a)) continue;
      if (best === -1 || arenaLoad[a] < arenaLoad[best]) best = a;
    }
    return best;
  }

  // Picks the least-loaded judge available in this slot, never one of the two
  // players of the match being judged.
  function pickJudge(busy: Set<string>, p1: string, p2: string): string | null {
    let best: string | null = null;
    for (const j of judges) {
      if (j === p1 || j === p2 || busy.has(j)) continue;
      if (best === null || (judgeLoad.get(j) ?? 0) < (judgeLoad.get(best) ?? 0)) best = j;
    }
    return best;
  }

  return matches.map((m) => {
    const p1 = getP1(m);
    const p2 = getP2(m);

    for (let s = 0; s < slots.length; s++) {
      const slot = slots[s];
      if (slot.arenas.size >= arenaCount) continue;
      if (slot.busy.has(p1) || slot.busy.has(p2)) continue;

      let judge: string | null = null;
      if (hasJudges) {
        judge = pickJudge(slot.busy, p1, p2);
        if (judge === null) continue; // no eligible judge free in this slot
      }

      const arena = pickArena(slot.arenas);
      slot.busy.add(p1);
      slot.busy.add(p2);
      slot.arenas.add(arena);
      arenaLoad[arena]++;
      if (judge) {
        slot.busy.add(judge);
        judgeLoad.set(judge, (judgeLoad.get(judge) ?? 0) + 1);
      }
      return { match: m, slot: s, arena, judgeId: judge };
    }

    // No existing slot works — open a new one, picking the least-loaded arena overall
    const busy = new Set<string>([p1, p2]);
    const judge = hasJudges ? pickJudge(busy, p1, p2) : null;
    const arena = pickArena(new Set());
    arenaLoad[arena]++;
    if (judge) {
      busy.add(judge);
      judgeLoad.set(judge, (judgeLoad.get(judge) ?? 0) + 1);
    }
    slots.push({ busy, arenas: new Set([arena]) });
    return { match: m, slot: slots.length - 1, arena, judgeId: judge };
  });
}
