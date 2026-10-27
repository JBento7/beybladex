// League ranking query, shared by the home page and /rankings.
import { prisma } from "./prisma";
import { sortRanking, type RankingEntry } from "./rankingMath";

export const RANKING_SCOPES = {
  lbl: { label: "LBL · Londrina", logo: "/lbl-logo.png", where: { communitySlug: "lbl", isPartnership: false } },
  lbm: { label: "LBM · Maringá", logo: "/lbm-logo.webp", where: { communitySlug: "lbm", isPartnership: false } },
  parceria: { label: "LBL + LBM (parceria)", logo: null, where: { isPartnership: true } },
} as const;
export type RankingScope = keyof typeof RANKING_SCOPES;

export async function getLeagueRanking(scope: RankingScope): Promise<RankingEntry[]> {
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
