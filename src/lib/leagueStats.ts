// Real activity figures for the public home page, scoped to ONE league (the
// host community of the event). Cached for 10 minutes so the landing page
// doesn't run these counts on every visit.
import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";

export type LeagueStats = {
  /** Finished, non-test events hosted by the league (official + BeyEncontros). */
  finishedEvents: number;
  /** Distinct registered accounts (not guests) that played at least one of those events. */
  players: number;
  /** Winner of the most recent finished official event of the league. */
  lastChampion: { name: string; tournament: string; tournamentId: string } | null;
};

async function compute(slug: string): Promise<LeagueStats> {
  const scope = { communitySlug: slug, isTest: false, status: "FINISHED" as const };
  const [finishedEvents, playerRows, last] = await Promise.all([
    prisma.tournament.count({ where: scope }),
    prisma.tournamentParticipant.findMany({
      where: {
        tournament: scope,
        user: { isGuest: false, deleted: false, NOT: [{ email: { endsWith: ".arena" } }, { email: { endsWith: ".juiz" } }] },
      },
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.tournament.findFirst({
      where: { ...scope, isOfficial: true, participants: { some: { placement: 1 } } },
      orderBy: [{ startDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        participants: { where: { placement: 1 }, take: 1, select: { user: { select: { name: true, bladerName: true } } } },
      },
    }),
  ]);
  const champ = last?.participants[0]?.user;
  return {
    finishedEvents,
    players: playerRows.length,
    lastChampion: last && champ ? { name: champ.bladerName || champ.name, tournament: last.name, tournamentId: last.id } : null,
  };
}

export function getLeagueStats(slug = "lbl"): Promise<LeagueStats | null> {
  return unstable_cache(() => compute(slug), ["league-stats", slug], { revalidate: 600 })().catch((e) => {
    console.error("[leagueStats]", e);
    return null; // no reliable data → the page omits the figures
  });
}
