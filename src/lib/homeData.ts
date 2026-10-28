// Data for the public league panel (home page). Everything comes from the
// database; shared parts are cached briefly (60 s) and the per-user bits
// (am I registered? where am I in the ranking?) are added per request.
import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";
import { tournamentsVersion } from "./publicVersion";
import { eventPodium, type StandingsMatch } from "./standings";
import { swissRoundCount } from "./tournament-engine";
import { isSwissFormat } from "./swiss";
import { getLeagueRanking } from "./leagueRanking";
import { formatLabel } from "./format";
import { registrationState } from "./registration";
import type { RankingEntry } from "./rankingMath";

const LEAGUE = "lbl";
// League events: hosted by the league or partnerships it takes part in; never tests.
const leagueWhere = { isTest: false, OR: [{ communitySlug: LEAGUE }, { isPartnership: true }] };

export type FeaturedEvent = {
  id: string;
  name: string;
  status: string;
  isOfficial: boolean;
  isPartnership: boolean;
  communitySlug: string;
  bannerUrl: string | null;
  startDate: string | null; // ISO, wall time stored as UTC
  hasTime: boolean;
  venue: string | null;
  address: string | null;
  format: string;
  deckType: string;
  qualifiers: number | null;
  entryFee: number | null;
  maxParticipants: number | null;
  participantCount: number;
  registrationOpen: boolean;
};

export type PodiumPerson = { userId: string; name: string; avatarUrl: string | null };
export type LastEvent = {
  id: string;
  name: string;
  date: string | null;
  participantCount: number;
  formatText: string;
  first?: PodiumPerson;
  second?: PodiumPerson;
  third?: PodiumPerson;
};

async function loadFeatured(): Promise<FeaturedEvent | null> {
  const select = {
    id: true, name: true, status: true, isOfficial: true, isPartnership: true, communitySlug: true, bannerUrl: true, startDate: true,
    venueName: true, location: true, address: true, format: true, deckType: true, qualifiers: true, entryFee: true,
    maxParticipants: true, registrationDeadline: true, _count: { select: { participants: true } },
  } as const;
  // 1) An event happening now (official first). 2) Otherwise the next one
  // taking sign-ups, soonest date first (undated last). Finished events and
  // drafts are never presented as "next".
  const live = await prisma.tournament.findFirst({
    where: { ...leagueWhere, status: "IN_PROGRESS" },
    orderBy: [{ isOfficial: "desc" }, { startDate: { sort: "desc", nulls: "last" } }],
    select,
  });
  const t = live ?? (await prisma.tournament.findFirst({
    where: { ...leagueWhere, status: "REGISTRATION" },
    orderBy: [{ startDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    select,
  }));
  if (!t) return null;
  const d = t.startDate ? new Date(t.startDate) : null;
  const reg = registrationState({ status: t.status, registrationDeadline: t.registrationDeadline, maxParticipants: t.maxParticipants, participantCount: t._count.participants });
  return {
    id: t.id, name: t.name, status: t.status, isOfficial: t.isOfficial, isPartnership: t.isPartnership, communitySlug: t.communitySlug,
    bannerUrl: t.bannerUrl, startDate: d ? d.toISOString() : null,
    hasTime: !!d && (d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0),
    venue: t.venueName ?? t.location, address: t.address, format: t.format, deckType: t.deckType,
    qualifiers: t.qualifiers, entryFee: t.entryFee, maxParticipants: t.maxParticipants,
    participantCount: t._count.participants,
    registrationOpen: reg.open,
  };
}

async function loadLastEvent(): Promise<LastEvent | null> {
  const t = await prisma.tournament.findFirst({
    where: { ...leagueWhere, status: "FINISHED" },
    orderBy: [{ startDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    select: {
      id: true, name: true, startDate: true, format: true, status: true, swissRounds: true, qualifiers: true, deckType: true,
      participants: {
        where: { approved: { not: false } },
        select: { userId: true, placement: true, user: { select: { name: true, bladerName: true, avatarUrl: true } } },
      },
      matches: {
        select: { round: true, status: true, player1Id: true, player2Id: true, winnerId: true, isWalkover: true, isThirdPlace: true },
      },
    },
  });
  if (!t) return null;
  const swissRounds = isSwissFormat(t.format) ? t.swissRounds ?? swissRoundCount(t.participants.length) : 0;
  const podium = eventPodium({
    format: t.format,
    status: t.status,
    swissRounds,
    matches: t.matches as StandingsMatch[],
    placements: t.participants.map((p) => ({ userId: p.userId, placement: p.placement })),
  });
  const person = (id?: string): PodiumPerson | undefined => {
    const p = id ? t.participants.find((x) => x.userId === id) : undefined;
    return p ? { userId: p.userId, name: p.user.bladerName || p.user.name, avatarUrl: p.user.avatarUrl } : undefined;
  };
  return {
    id: t.id,
    name: t.name,
    date: t.startDate ? t.startDate.toISOString() : null,
    participantCount: t.participants.length,
    formatText: formatLabel(t.format, t.qualifiers, t.deckType),
    first: person(podium.first),
    second: person(podium.second),
    third: person(podium.third),
  };
}

export type HomeData = {
  featured: FeaturedEvent | null;
  /** A league event exists as a draft (being set up, not announced yet). */
  hasDraft: boolean;
  last: LastEvent | null;
  ranking: RankingEntry[];
};

const cachedHomeData = (version: string) => unstable_cache(
  async (): Promise<HomeData> => {
    const [featured, last, ranking, drafts] = await Promise.all([
      loadFeatured(),
      loadLastEvent(),
      getLeagueRanking(LEAGUE),
      prisma.tournament.count({ where: { ...leagueWhere, status: "DRAFT" } }),
    ]);
    return { featured, hasDraft: drafts > 0, last, ranking };
  },
  ["home-data-v5", version],
  { revalidate: 300, tags: ["home", "ranking"] }
)();

/** Shared home data (no per-user bits). Keyed by the public tournaments
 *  version, so it refreshes on the first request after any change; the timer
 *  is only a backstop. If the version can't be read, fall back to a short
 *  time-based entry rather than failing the page. */
export async function getHomeData(): Promise<HomeData> {
  const version = await tournamentsVersion().catch(() => `t${Math.floor(Date.now() / 60_000)}`);
  return cachedHomeData(version);
}

/** Per-user: is this player registered in the featured event? */
export async function isRegistered(tournamentId: string, userId: string | undefined | null): Promise<boolean> {
  if (!userId) return false;
  const p = await prisma.tournamentParticipant.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
    select: { id: true },
  });
  return !!p;
}
