// Pure ranking helpers (unit-tested). The league ranking is the SUM of the
// ranking points a player earned in official, non-test tournaments of that
// league (100/70/50/30/10 for 1st–5th; with a knockout only bracket players
// score). Ties are ordered alphabetically by nickname — the same rule the
// Ranking page has always used — and then by id.

export type RankingEntry = { id: string; name: string; points: number; wins: number; losses: number; avatarUrl?: string | null };

export function sortRanking<T extends RankingEntry>(list: T[]): T[] {
  return list
    .filter((r) => r.points > 0)
    // Points → nickname (A→Z) → id: fully deterministic even for equal nicknames.
    .sort((a, b) => b.points - a.points || (a.name ?? "").localeCompare(b.name ?? "", "pt-BR") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Top N plus, when the user is outside it, their real position (never moved into the top). */
export function rankingPreview<T extends RankingEntry>(sorted: T[], userId: string | null | undefined, top = 5) {
  const head = sorted.slice(0, top).map((r, i) => ({ ...r, position: i + 1 }));
  const idx = userId ? sorted.findIndex((r) => r.id === userId) : -1;
  const me = idx >= top ? { ...sorted[idx], position: idx + 1 } : null;
  return { top: head, me, total: sorted.length };
}
