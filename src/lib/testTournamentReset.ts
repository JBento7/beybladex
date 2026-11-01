// "Reiniciar Torneio" (test events only): wipes matches and results and
// reopens registration, leaving nothing that makes the next start believe a
// round already exists.
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export async function resetTestTournament(tournamentId: string): Promise<{ matches: number }> {
  const matchIds = (await prisma.match.findMany({ where: { tournamentId }, select: { id: true } })).map((m) => m.id);
  await prisma.$transaction([
    prisma.matchPoint.deleteMany({ where: { matchId: { in: matchIds } } }),
    prisma.matchSet.deleteMany({ where: { matchId: { in: matchIds } } }),
    // Deck orders reference the match (no cascade): without this a 3on3 test
    // with orders couldn't be reset.
    prisma.matchDeckOrder.deleteMany({ where: { matchId: { in: matchIds } } }),
    prisma.match.deleteMany({ where: { tournamentId } }),
    // The Swiss round log is unique per (tournament, round): a stale round 1
    // made the next start believe the round already existed and leave the
    // event "Em andamento" with no matches.
    prisma.swissRoundLog.deleteMany({ where: { tournamentId } }),
    prisma.group.deleteMany({ where: { tournamentId } }),
    prisma.tournamentJudge.deleteMany({ where: { tournamentId } }),
    prisma.tournamentParticipant.updateMany({
      where: { tournamentId },
      data: { totalPoints: 0, wins: 0, losses: 0, rankingPoints: 0, placement: null, groupId: null, finalsSwapUsed: false },
    }),
    prisma.tournament.update({
      where: { id: tournamentId },
      // Un-freeze the Swiss round count: the next start re-derives it.
      // Same for the frozen ranking table: the next finalization freezes it again.
      data: { status: "REGISTRATION", swissRounds: null, rankingPointsTable: Prisma.DbNull },
    }),
  ]);
  return { matches: matchIds.length };
}
