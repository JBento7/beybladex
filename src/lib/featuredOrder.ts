// Order of the home "Torneios em destaque" carousel. No imports: unit-tested
// directly by Node (tests/featuredOrder.test.ts).
//  1. events happening now (official first, then the most recent start);
//  2. events taking sign-ups, soonest start first;
//  3. events without a date last; ties by newest creation, then id.

export type FeaturedSortable = {
  id: string;
  status: string;
  isOfficial: boolean;
  startDate: string | null; // ISO
  createdAt: string; // ISO
};

const time = (iso: string | null) => (iso ? Date.parse(iso) : null);

export function sortFeatured<T extends FeaturedSortable>(list: T[]): T[] {
  const rank = (t: T) => (t.status === "IN_PROGRESS" ? 0 : 1);
  return [...list].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const ta = time(a.startDate);
    const tb = time(b.startDate);
    if (rank(a) === 0) {
      if (a.isOfficial !== b.isOfficial) return a.isOfficial ? -1 : 1;
      if (ta !== tb) return ta === null ? 1 : tb === null ? -1 : tb - ta; // most recent start first
    } else if (ta !== tb) {
      if (ta === null) return 1; // undated last
      if (tb === null) return -1;
      return ta - tb; // soonest first
    }
    const ca = Date.parse(a.createdAt);
    const cb = Date.parse(b.createdAt);
    if (ca !== cb) return cb - ca;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
