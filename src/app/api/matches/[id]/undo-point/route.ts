export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Remove the most recent point from the current active set.
// Works only while the match is IN_PROGRESS.
// Authorized: ORGANIZER, match judge, or tournament organizer.
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const match = await prisma.match.findUnique({
    where: { id: params.id },
    include: { tournament: { select: { organizerId: true, pointsToWinSet: true } } },
  });

  if (!match) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
  if (
    match.tournament.organizerId !== session.user.id &&
    session.user.role !== "ORGANIZER" &&
    !session.user.canJudge &&
    match.judgeId !== session.user.id
  ) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }
  if (match.status === "FINISHED") {
    return NextResponse.json({ error: "Partida já finalizada — use o painel admin para editar" }, { status: 400 });
  }

  // Find the most recent MatchPoint for this match
  const lastPoint = await prisma.matchPoint.findFirst({
    where: { matchId: params.id },
    orderBy: { createdAt: "desc" },
  });

  if (!lastPoint) return NextResponse.json({ error: "Nenhum ponto para desfazer" }, { status: 400 });

  const pointsToWinSet = match.tournament.pointsToWinSet;

  await prisma.$transaction(async (tx) => {
    await tx.matchPoint.delete({ where: { id: lastPoint.id } });

    if (lastPoint.setId) {
      // Recalculate set points from remaining MatchPoints
      const remaining = await tx.matchPoint.findMany({ where: { setId: lastPoint.setId } });
      const setPointCount = remaining.length;
      const p1Pts = remaining.filter((p) => p.userId === match.player1Id).reduce((s, p) => s + p.points, 0);
      const p2Pts = remaining.filter((p) => p.userId !== match.player1Id).reduce((s, p) => s + p.points, 0);

      if (setPointCount === 0) {
        // The set is now empty — remove it so the next point recreates set N cleanly.
        await tx.matchSet.delete({ where: { id: lastPoint.setId } });
      } else {
        const p1Won = p1Pts >= pointsToWinSet;
        const p2Won = p2Pts >= pointsToWinSet;
        const setWon = p1Won || p2Won;
        await tx.matchSet.update({
          where: { id: lastPoint.setId },
          data: {
            player1Points: p1Pts,
            player2Points: p2Pts,
            // Reopen the set if the deleted point was the winning one.
            status: setWon ? "FINISHED" : "IN_PROGRESS",
            // Correctly credit whichever player crossed the threshold (was a bug
            // that dropped player 2's win and orphaned the set).
            winnerId: p1Won ? match.player1Id : p2Won ? match.player2Id : null,
          },
        });
      }
    }

    // If no points remain in the whole match, send it back to PENDING so it no
    // longer shows as "Ao Vivo" with an empty scoreboard.
    const remainingForMatch = await tx.matchPoint.count({ where: { matchId: params.id } });
    if (remainingForMatch === 0) {
      await tx.matchSet.deleteMany({ where: { matchId: params.id } });
      await tx.match.update({ where: { id: params.id }, data: { status: "PENDING", winnerId: null } });
    }
  });

  return NextResponse.json({ ok: true });
}
