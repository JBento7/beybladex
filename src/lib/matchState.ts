// Official state of one match for the judge panel (docs/JUIZ-TELAO.md). The
// same payload is returned by GET /api/matches/[id]/sets and by every scoring
// operation (point, undo), so the panel always shows what the server stored —
// never a locally derived score.
import type { Session } from "next-auth";
import { prisma } from "./prisma";
import { hasMatchTrio, usesBattleDeck } from "./deckFormat";
import { trioView } from "./matchTrio";
import { isMatchStaff } from "./matchAccess";
import { matchPhaseLabel } from "./matchLabel";

export type LastLaunch = {
  pointId: string;
  userId: string;
  finishType: string;
  points: number;
  setNumber: number | null;
  actionId: string | null;
  at: string;
};

export async function loadMatchState(matchId: string, session: Session | null) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      sets: { orderBy: { setNumber: "asc" }, include: { points: { select: { id: true } } } },
      tournament: { select: { setsToWin: true, pointsToWinSet: true, deckType: true, communitySlug: true, format: true, swissRounds: true } },
    },
  });
  if (!match) return null;

  const sets = match.sets.map(({ points: _pts, ...s }) => s);
  const player1Sets = sets.filter((s) => s.winnerId === match.player1Id).length;
  const player2Sets = sets.filter((s) => s.winnerId === match.player2Id).length;
  const currentSet = match.sets.find((s) => s.status === "IN_PROGRESS") ?? null;
  const currentSetBattleCount = currentSet ? currentSet.points.length : 0;

  const [deckOrdersRaw, last, roundSize] = await Promise.all([
    // Table may be missing on an old database: deck orders are then unavailable.
    prisma.matchDeckOrder.findMany({ where: { matchId }, orderBy: { cycleIndex: "asc" } }).catch(() => [] as { userId: string }[]),
    prisma.matchPoint.findFirst({
      where: { matchId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, userId: true, finishType: true, points: true, actionId: true, createdAt: true, set: { select: { setNumber: true } } },
    }),
    prisma.match.count({ where: { tournamentId: match.tournamentId, round: match.round, isThirdPlace: false, NOT: { player1Id: { equals: prisma.match.fields.player2Id } } } }).catch(() => 0),
  ]);

  // 3on3 + 1 reserva: an order reveals the trio. Until BOTH trios are
  // confirmed, each player's order is visible only to that player and to
  // staff (judge/organizer); after that (and after the lock) it's open.
  let deckOrders = deckOrdersRaw;
  let trio: Awaited<ReturnType<typeof trioView>> = null;
  if (hasMatchTrio(match.tournament.deckType)) {
    const viewer = session?.user ? { id: session.user.id, staff: await isMatchStaff(session, matchId) } : null;
    trio = await trioView(matchId, viewer);
    if (trio && !trio.bothConfirmed && !trio.locked && !viewer?.staff) {
      deckOrders = deckOrders.filter((o) => o.userId === viewer?.id);
    }
  }

  const lastLaunch: LastLaunch | null = last
    ? { pointId: last.id, userId: last.userId, finishType: last.finishType, points: last.points, setNumber: last.set?.setNumber ?? null, actionId: last.actionId, at: last.createdAt.toISOString() }
    : null;

  return {
    matchId: match.id,
    status: match.status,
    scoreVersion: match.scoreVersion,
    sets,
    currentSet: currentSet ? { ...currentSet, points: undefined } : null,
    player1Sets,
    player2Sets,
    matchFinished: match.status === "FINISHED",
    winnerId: match.winnerId,
    isWalkover: match.isWalkover,
    setsToWin: match.setsToWin ?? match.tournament.setsToWin,
    pointsToWinSet: match.pointsToWinSet ?? match.tournament.pointsToWinSet,
    isDeckThreeOnThree: usesBattleDeck(match.tournament.deckType),
    deckOrders,
    trio,
    currentSetBattleCount,
    // Which player is on the X side (other = B side); null until the judge sets it.
    xSidePlayerId: match.xSidePlayerId ?? null,
    arena: match.arena ?? 1,
    community: match.tournament.communitySlug,
    phase: matchPhaseLabel({ format: match.tournament.format, round: match.round, swissRounds: match.tournament.swissRounds, isThirdPlace: match.isThirdPlace, roundSize }),
    round: match.round,
    player1Id: match.player1Id,
    player2Id: match.player2Id,
    lastLaunch,
  };
}

export type MatchStateView = NonNullable<Awaited<ReturnType<typeof loadMatchState>>>;
