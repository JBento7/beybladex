// Tournament list — filtered, ordered and paginated IN THE DATABASE (the page
// used to load every tournament with its full regulation and filter in the
// browser). Shared by the /tournaments page (first page, server-rendered) and
// /api/tournaments/list ("carregar mais" and filter changes).
//
// Order is stable (always ends with id) so pages never repeat or skip items:
//  - "proximos"/"inscricoes": soonest first, undated last;
//  - everything else: most recent first.
// "todos" returns the active events (in progress, sign-ups, drafts the viewer
// may see — a short list) on the first page and paginates the past ones.
//
// Drafts are private: only the event's organizer and admins in scope see them.
import type { Prisma, TournamentStatus } from "@prisma/client";
import type { Session } from "next-auth";
import { prisma } from "./prisma";
import { registrationState } from "./registration";
import type { StatusFilter } from "./tournamentFilters";

export const PAGE_SIZE = 24;
const ACTIVE_CAP = 100;
const DESCRIPTION_CHARS = 180;

export type TournamentListItem = {
  id: string; name: string; description: string | null; format: string; status: string;
  isOfficial: boolean; communitySlug: string; isPartnership: boolean; prize: string | null;
  /** "Pontuação dobrada" (official event awarding 2× ranking points). */
  doubleRankingPoints: boolean;
  startDate: string | null; maxParticipants: number | null; bannerUrl: string | null;
  location: string | null; entryFee: number | null; organizer: { name: string };
  participantCount: number; isJoined: boolean; canJoin: boolean;
};
export type TournamentListPage = {
  items: TournamentListItem[];
  counts: Record<StatusFilter, number>;
  hasMore: boolean;
  page: number;
};

/** Who may see DRAFT events: the organizer, and admins of that league. */
export function draftVisibility(session: Session | null): Prisma.TournamentWhereInput {
  const u = session?.user;
  if (u?.role === "ORGANIZER" && !u.adminCommunity) return {};
  const allowed: Prisma.TournamentWhereInput[] = [{ status: { not: "DRAFT" } }];
  if (u?.id) allowed.push({ organizerId: u.id });
  if (u?.role === "ORGANIZER" && u.adminCommunity) allowed.push({ communitySlug: u.adminCommunity }, { isPartnership: true });
  return { OR: allowed };
}

/** Same rule for one event (the event page). */
export function canSeeDraft(session: Session | null, t: { organizerId: string; communitySlug: string; isPartnership: boolean }): boolean {
  const u = session?.user;
  if (!u) return false;
  if (u.id === t.organizerId) return true;
  return u.role === "ORGANIZER" && (!u.adminCommunity || u.adminCommunity === t.communitySlug || t.isPartnership);
}

const STATUS_OF: Record<StatusFilter, TournamentStatus[] | null> = {
  todos: null,
  proximos: ["REGISTRATION", "DRAFT"],
  inscricoes: ["REGISTRATION"],
  andamento: ["IN_PROGRESS"],
  anteriores: ["FINISHED"],
};

const UPCOMING_ORDER: Prisma.TournamentOrderByWithRelationInput[] = [{ startDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }, { id: "desc" }];
const RECENT_ORDER: Prisma.TournamentOrderByWithRelationInput[] = [{ startDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }, { id: "desc" }];

const SELECT = {
  id: true, name: true, description: true, format: true, status: true, isOfficial: true, communitySlug: true,
  isPartnership: true, doubleRankingPoints: true, prize: true, startDate: true, maxParticipants: true, bannerUrl: true, location: true,
  entryFee: true, registrationDeadline: true,
  organizer: { select: { name: true } },
  _count: { select: { participants: true } },
} satisfies Prisma.TournamentSelect;

/** Plain-text excerpt: lists never carry the full regulation. */
export function excerpt(text: string | null, max = DESCRIPTION_CHARS): string | null {
  if (!text) return null;
  const plain = text.replace(/<[^>]+>/g, " ").replace(/[*_#>`~[\]()!-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!plain) return null;
  return plain.length > max ? plain.slice(0, max - 1).trimEnd() + "…" : plain;
}

export async function listTournaments(opts: {
  session: Session | null; status: StatusFilter; liga: string; q: string; page: number;
}): Promise<TournamentListPage> {
  const { session, status, liga } = opts;
  const q = opts.q.trim().slice(0, 100);
  const page = Math.max(0, Math.min(500, Math.floor(opts.page) || 0));

  const base: Prisma.TournamentWhereInput = {
    AND: [
      { isTest: false },
      draftVisibility(session),
      liga !== "todas" ? { OR: [{ communitySlug: liga }, { isPartnership: true }] } : {},
      q ? { OR: [
        { name: { contains: q, mode: "insensitive" } },
        { location: { contains: q, mode: "insensitive" } },
        { organizer: { name: { contains: q, mode: "insensitive" } } },
      ] } : {},
    ],
  };

  const statuses = STATUS_OF[status];
  const upcoming = status === "proximos" || status === "inscricoes";
  const pagedWhere: Prisma.TournamentWhereInput = { AND: [base, { status: { in: statuses ?? ["FINISHED"] } }] };

  const [byStatus, rows, active] = await Promise.all([
    prisma.tournament.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
    prisma.tournament.findMany({
      where: pagedWhere, select: SELECT, orderBy: upcoming ? UPCOMING_ORDER : RECENT_ORDER,
      skip: page * PAGE_SIZE, take: PAGE_SIZE + 1,
    }),
    status === "todos" && page === 0
      ? prisma.tournament.findMany({ where: { AND: [base, { status: { not: "FINISHED" } }] }, select: SELECT, orderBy: UPCOMING_ORDER, take: ACTIVE_CAP })
      : Promise.resolve([]),
  ]);

  const n = (s: TournamentStatus) => byStatus.find((g) => g.status === s)?._count._all ?? 0;
  const counts: Record<StatusFilter, number> = {
    todos: byStatus.reduce((a, g) => a + g._count._all, 0),
    proximos: n("REGISTRATION") + n("DRAFT"),
    inscricoes: n("REGISTRATION"),
    andamento: n("IN_PROGRESS"),
    anteriores: n("FINISHED"),
  };

  const hasMore = rows.length > PAGE_SIZE;
  const list = [...active, ...rows.slice(0, PAGE_SIZE)];
  const joined = session && list.length
    ? new Set((await prisma.tournamentParticipant.findMany({
        where: { userId: session.user.id, tournamentId: { in: list.map((t) => t.id) } },
        select: { tournamentId: true },
      })).map((p) => p.tournamentId))
    : new Set<string>();

  const items = list.map((t): TournamentListItem => ({
    id: t.id, name: t.name, description: excerpt(t.description), format: t.format, status: t.status,
    isOfficial: t.isOfficial, communitySlug: t.communitySlug, isPartnership: t.isPartnership, doubleRankingPoints: t.isOfficial && t.doubleRankingPoints, prize: t.prize,
    startDate: t.startDate ? t.startDate.toISOString() : null, maxParticipants: t.maxParticipants,
    bannerUrl: t.bannerUrl, location: t.location, entryFee: t.entryFee, organizer: { name: t.organizer.name },
    participantCount: t._count.participants,
    isJoined: joined.has(t.id),
    // Same rule as the join API (lib/registration).
    canJoin: !!session && !joined.has(t.id) && registrationState({ status: t.status, registrationDeadline: t.registrationDeadline, maxParticipants: t.maxParticipants, participantCount: t._count.participants }).open,
  }));

  return { items, counts, hasMore, page };
}
