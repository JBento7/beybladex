export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recalculateStandings, revertBeybladeStats } from "@/lib/tournament-engine";

// ORGANIZER-only: reset a match back to PENDING for re-scoring.
// Clears all MatchPoints and MatchSets for this match, then
// recalculates standings for both players so stats reflect the removal.
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const match = await prisma.match.findUnique({
    where: { id: params.id },
    select: { id: true, tournamentId: true, player1Id: true, player2Id: true, status: true, winnerId: true, tournament: { select: { isTest: true } } },
  });

  if (!match) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });

  // A bye is a self-match stored as already FINISHED. Resetting it to PENDING
  // would leave a "match" nobody can play, so its round could never complete and
  // the tournament would stall. Byes aren't a result to correct.
  if (match.player1Id === match.player2Id) {
    return NextResponse.json(
      { error: "Esta entrada é um BYE (passou automaticamente), não uma partida — não pode ser resetada." },
      { status: 400 }
    );
  }

  // If the match had a result, undo the beyblade win/loss it credited BEFORE we
  // delete the points (revert reads them to resolve which combos were involved).
  if (
    match.status === "FINISHED" &&
    match.winnerId &&
    match.player1Id !== match.player2Id &&
    !match.tournament.isTest
  ) {
    const loserId = match.winnerId === match.player1Id ? match.player2Id : match.player1Id;
    await revertBeybladeStats(match.id, match.winnerId, loserId);
  }

  await prisma.$transaction(async (tx) => {
    // Clear all MatchPoints and MatchSets for this match
    await tx.matchPoint.deleteMany({ where: { matchId: params.id } });
    await tx.matchSet.deleteMany({ where: { matchId: params.id } });

    // Reset match to PENDING
    await tx.match.update({
      where: { id: params.id },
      data: { status: "PENDING", winnerId: null, isWalkover: false },
    });
  });

  // Recalculate standings for both players from remaining match history
  await Promise.all([
    recalculateStandings(match.tournamentId, match.player1Id),
    recalculateStandings(match.tournamentId, match.player2Id),
  ]);

  return NextResponse.json({ ok: true });
}
