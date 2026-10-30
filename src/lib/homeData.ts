// Data for the public league panel (home page). Everything comes from the
// database; shared parts are cached briefly (60 s) and the per-user bits
// (am I registered? where am I in the ranking?) are added per request.
// "Ranking geral" and "Último torneio" follow the league of the signed-in
// player's profile (homeCommunity); visitors and profiles without one see LBL.
import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";
import { tournamentsVersion } from "./publicVersion";
import { eventPodium, type StandingsMatch } from "./standings";
import { swissRoundCount } from "./tournament-engine";
import { isSwissFormat } from "./swiss";
import { getMonthlyRanking } from "./monthlyRanking";
import { currentMonth } from "./monthlyRules";
import { sortFeatured } from "./featuredOrder";
import { formatLabel } from "./format";
import { registrationState } from "./registration";
import type { RankingEntry } from "./rankingMath";

export type HomeLeague = "lbl" | "lbm";
export const DEFAULT_HOME_LEAGUE: HomeLeague = "lbl";

/** Normalizes a profile's homeCommunity: "lbm" → LBM, anything else → LBL. */
export function homeLeagueOf(raw: string | null | undefined): HomeLeague {
  return String(raw ?? "").trim().toLowerCase() === "lbm" ? "lbm" : "lbl";
}

/** League of the signed-in player, read from the profile itself (not the
 *  theme cookie, and not a JWT that may predate a change). Falls back to the
 *  session's copy if the read fails; no user → LBL. */
export async function homeLeagueForUser(userId: string | null | undefined, sessionValue?: string | null): Promise<HomeLeague> {
  if (!userId) return DEFAULT_HOME_LEAGUE;
  try {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { homeCommunity: true } });
    return homeLeagueOf(u ? u.homeCommunity : sessionValue);
  } catch {
    return homeLeagueOf(sessionValue);
  }
}

// Featured events (carousel): LBL events or partnerships; never tests. Only
// REGISTRATION / IN_PROGRESS are loaded, so drafts and finished events never appear.
const featuredWhere = { isTest: false, OR: [{ communitySlug: DEFAULT_HOME_LEAGUE }, { isPartnership: true }] };
// "Último torneio": only events of that league — partnerships are not pulled
// in, and the other league is never used as a substitute.
const lastEventWhere = (league: HomeLeague) => ({ isTest: false, communitySlug: league, isPartnership: false });

export type FeaturedEvent = {
  id: string;
  name: string;
  status: string;
  isOfficial: boolean;
  isPartnership: boolean;
  /** "Pontuação dobrada" (official event awarding 2× ranking points). */
  doubleRankingPoints: boolean;
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

/** Every active featured event (in progress or taking sign-ups), in carousel
 *  order (lib/featuredOrder). One query; only the fields the card shows. */
async function loadFeatured(): Promise<FeaturedEvent[]> {
  const rows = await prisma.tournament.findMany({
    where: { ...featuredWhere, status: { in: ["IN_PROGRESS", "REGISTRATION"] } },
    select: {
      id: true, name: true, status: true, isOfficial: true, isPartnership: true, doubleRankingPoints: true, communitySlug: true, bannerUrl: true, startDate: true,
      venueName: true, location: true, address: true, format: true, deckType: true, qualifiers: true, entryFee: true,
      maxParticipants: true, registrationDeadline: true, createdAt: true, _count: { select: { participants: true } },
    },
  });
  const keyed = rows.map((t) => {
    const d = t.startDate ? new Date(t.startDate) : null;
    const reg = registrationState({ status: t.status, registrationDeadline: t.registrationDeadline, maxParticipants: t.maxParticipants, participantCount: t._count.participants });
    const event: FeaturedEvent = {
      id: t.id, name: t.name, status: t.status, isOfficial: t.isOfficial, isPartnership: t.isPartnership, doubleRankingPoints: t.isOfficial && t.doubleRankingPoints, communitySlug: t.communitySlug,
      bannerUrl: t.bannerUrl, startDate: d ? d.toISOString() : null,
      hasTime: !!d && (d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0),
      venue: t.venueName ?? t.location, address: t.address, format: t.format, deckType: t.deckType,
      qualifiers: t.qualifiers, entryFee: t.entryFee, maxParticipants: t.maxParticipants,
      participantCount: t._count.participants,
      registrationOpen: reg.open,
    };
    return { id: t.id, status: t.status, isOfficial: t.isOfficial, startDate: event.startDate, createdAt: t.createdAt.toISOString(), event };
  });
  return sortFeatured(keyed).map((k) => k.event);
}

async function loadLastEvent(league: HomeLeague): Promise<LastEvent | null> {
  const t = await prisma.tournament.findFirst({
    where: { ...lastEventWhere(league), status: "FINISHED" },
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
  /** League shown by the ranking and last-event cards. */
  league: HomeLeague;
  /** Month ("AAAA-MM", São Paulo) of the monthly ranking card. */
  month: string;
  /** Active featured events, in carousel order (empty = none). */
  featured: FeaturedEvent[];
  last: LastEvent | null;
  ranking: RankingEntry[];
};

// Public, shared entries only (nothing per user). The league is part of the
// key so LBL and LBM results can never be mixed. Outside a Next request
// (tests/scripts) there is no cache: compute directly, like getMonthlyRanking.
const outsideNext = (e: unknown) => /incrementalCache|static generation store/i.test(String(e));
function cached<T>(fn: () => Promise<T>, key: string[], tags: string[]): Promise<T> {
  try {
    return unstable_cache(fn, key, { revalidate: 300, tags })().catch((e) => { if (outsideNext(e)) return fn(); throw e; });
  } catch (e) {
    if (outsideNext(e)) return fn();
    throw e;
  }
}
const loadShared = async () => ({ featured: await loadFeatured() });

/** Shared home data (no per-user bits) for one league. Keyed by the public
 *  tournaments version, so it refreshes on the first request after any
 *  change; the timer is only a backstop. If the version can't be read, fall
 *  back to a short time-based entry rather than failing the page. */
export async function getHomeData(league: HomeLeague = DEFAULT_HOME_LEAGUE): Promise<HomeData> {
  const version = await tournamentsVersion().catch(() => `t${Math.floor(Date.now() / 60_000)}`);
  const month = currentMonth();
  const [shared, last, monthly] = await Promise.all([
    cached(loadShared, ["home-shared-v8", version], ["home"]),
    cached(() => loadLastEvent(league), ["home-last-event-v1", league, version], ["home", "ranking"]),
    // The same classification as /rankings (lib/monthlyRanking).
    getMonthlyRanking(league, month),
  ]);
  return { league, month, ...shared, last, ranking: monthly.entries };
}

/** Per-user: which of these events this player is registered in (one query). */
export async function registeredIn(tournamentIds: string[], userId: string | undefined | null): Promise<string[]> {
  if (!userId || tournamentIds.length === 0) return [];
  const rows = await prisma.tournamentParticipant.findMany({
    where: { userId, tournamentId: { in: tournamentIds } },
    select: { tournamentId: true },
  });
  return rows.map((r) => r.tournamentId);
}
