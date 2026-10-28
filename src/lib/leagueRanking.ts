// League ranking query, shared by the home page and /rankings.
import { unstable_cache, revalidateTag } from "next/cache";
import { prisma } from "./prisma";
import { sortRanking, type RankingEntry } from "./rankingMath";

export const RANKING_SCOPES = {
  lbl: { label: "LBL · Londrina", logo: "/brand/lbl-icon-96.webp", where: { communitySlug: "lbl", isPartnership: false } },
  lbm: { label: "LBM · Maringá", logo: "/brand/lbm-icon-96.webp", where: { communitySlug: "lbm", isPartnership: false } },
  parceria: { label: "LBL + LBM (parceria)", logo: null, where: { isPartnership: true } },
} as const;
export type RankingScope = keyof typeof RANKING_SCOPES;

async function computeLeagueRanking(scope: RankingScope): Promise<RankingEntry[]> {
  const ranking = await prisma.tournamentParticipant.groupBy({
    by: ["userId"],
    where: { tournament: { isOfficial: true, isTest: false, ...RANKING_SCOPES[scope].where }, user: { isGuest: false, deleted: false } },
    _sum: { rankingPoints: true, wins: true, losses: true },
  });
  const users = await prisma.user.findMany({
    where: { id: { in: ranking.map((r) => r.userId) }, NOT: [{ email: { endsWith: ".arena" } }, { email: { endsWith: ".juiz" } }] },
    select: { id: true, name: true, bladerName: true, avatarUrl: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));
  const list: RankingEntry[] = [];
  for (const r of ranking) {
    const u = userMap.get(r.userId);
    if (!u) continue;
    list.push({ id: u.id, name: u.bladerName ?? u.name, avatarUrl: u.avatarUrl, points: r._sum.rankingPoints ?? 0, wins: r._sum.wins ?? 0, losses: r._sum.losses ?? 0 });
  }
  return sortRanking(list);
}

/**
 * THE official ranking of a league (also what every "ranking oficial" label
 * shows). Shared, public data → cached 60 s and invalidated when an event is
 * finalized (revalidateRankings). Never personalised.
 */
const outsideNext = (e: unknown) => /incrementalCache|static generation store/i.test(String(e));
export function getLeagueRanking(scope: RankingScope): Promise<RankingEntry[]> {
  try {
    return unstable_cache(() => computeLeagueRanking(scope), ["league-ranking", scope], { revalidate: 60, tags: ["ranking"] })()
      .catch((e) => { if (outsideNext(e)) return computeLeagueRanking(scope); throw e; });
  } catch (e) {
    if (outsideNext(e)) return computeLeagueRanking(scope); // tests/scripts
    throw e;
  }
}

/** Official position of one player (1-based), or null if not ranked. */
export async function officialPosition(scope: RankingScope, userId: string): Promise<{ position: number | null; total: number; points: number }> {
  const list = await getLeagueRanking(scope);
  const i = list.findIndex((r) => r.id === userId);
  return { position: i >= 0 ? i + 1 : null, total: list.length, points: i >= 0 ? list[i].points : 0 };
}

/** League a player's personal summaries use for "ranking oficial". */
export function scopeOfHome(home: string | null | undefined): RankingScope {
  return home === "lbm" ? "lbm" : "lbl";
}

export function revalidateRankings() {
  try { revalidateTag("ranking"); } catch { /* outside a Next request */ }
}

// Battle points scored in official events, per player (the "pts" metric used
// to order the community list). A scan of every official point, so it's
// cached like the ranking (public data, 60 s, invalidated with "ranking").
async function computeOfficialBattlePoints(): Promise<Record<string, number>> {
  const agg = await prisma.matchPoint.groupBy({
    by: ["userId"],
    where: { match: { tournament: { isOfficial: true, isTest: false } } },
    _sum: { points: true },
  });
  return Object.fromEntries(agg.map((b) => [b.userId, b._sum.points ?? 0]));
}
export async function getOfficialBattlePoints(): Promise<Record<string, number>> {
  try {
    return await unstable_cache(computeOfficialBattlePoints, ["official-battle-points"], { revalidate: 60, tags: ["ranking"] })()
      .catch((e) => { if (outsideNext(e)) return computeOfficialBattlePoints(); throw e; });
  } catch (e) {
    if (outsideNext(e)) return computeOfficialBattlePoints();
    throw e;
  }
}
