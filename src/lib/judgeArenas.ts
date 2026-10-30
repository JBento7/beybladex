// "Minhas partidas" of a judge, organized by arena (docs/JUIZ-TELAO.md §5).
// Groups are tournament + arena, so two events using the same arena number
// are never mixed. Input = matches the judge may already judge (the caller
// filters with lib/matchPolicy): grouping never widens access.
// No imports: unit-tested directly by Node (tests/judgeArenas.test.ts).

export type ArenaMatch = {
  id: string;
  tournamentId: string;
  tournamentName: string;
  arena: number | null;
  status: string; // "IN_PROGRESS" | "PENDING"
  judgeId: string | null;
};

export type ArenaGroup<T extends ArenaMatch> = {
  key: string;
  tournamentId: string;
  tournamentName: string;
  arena: number | null;
  live: number;
  waiting: number;
  mine: T[];
  others: T[];
};

/** URL key of a group: "<tournamentId>~<arena>" ("sem" = no arena). */
export function arenaKey(tournamentId: string, arena: number | null | undefined): string {
  return `${tournamentId}~${arena ?? "sem"}`;
}

/**
 * Groups by tournament + arena. Within a group: in progress first, then
 * pending, keeping the input order (the call order) inside each status.
 * Groups: by arena number, "no arena" last, then tournament name.
 */
export function groupByArena<T extends ArenaMatch>(rows: T[], me: string): ArenaGroup<T>[] {
  const map = new Map<string, ArenaGroup<T>>();
  for (const m of rows) {
    const key = arenaKey(m.tournamentId, m.arena);
    let g = map.get(key);
    if (!g) {
      g = { key, tournamentId: m.tournamentId, tournamentName: m.tournamentName, arena: m.arena, live: 0, waiting: 0, mine: [], others: [] };
      map.set(key, g);
    }
    if (m.status === "IN_PROGRESS") g.live++;
    else g.waiting++;
    (m.judgeId === me ? g.mine : g.others).push(m);
  }
  const byStatus = (list: T[]) => [...list.filter((m) => m.status === "IN_PROGRESS"), ...list.filter((m) => m.status !== "IN_PROGRESS")];
  const groups = [...map.values()].map((g) => ({ ...g, mine: byStatus(g.mine), others: byStatus(g.others) }));
  return groups.sort((a, b) =>
    (a.arena ?? Number.MAX_SAFE_INTEGER) - (b.arena ?? Number.MAX_SAFE_INTEGER) ||
    a.tournamentName.localeCompare(b.tournamentName, "pt-BR") ||
    (a.tournamentId < b.tournamentId ? -1 : a.tournamentId > b.tournamentId ? 1 : 0)
  );
}
