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

  await prisma.$transaction(async (tx) => {
    await tx.matchPoint.delete({ where: { id: lastPoint.id } });

    if (lastPoint.setId) {
      // Recalculate set points from remaining MatchPoints
      const remaining = await tx.matchPoint.findMany({ where: { setId: lastPoint.setId } });
      const set = await tx.matchSet.findUnique({ where: { id: lastPoint.setId }, include: { match: { select: { player1Id: true } } } });
      if (!set) return;

      const p1Pts = remaining.filter((p) => p.userId === set.match.player1Id).reduce((s, p) => s + p.points, 0);
      const p2Pts = remaining.filter((p) => p.userId !== set.match.player1Id).reduce((s, p) => s + p.points, 0);

      const pointsToWinSet = match.tournament.pointsToWinSet;
      const setWon = p1Pts >= pointsToWinSet || p2Pts >= pointsToWinSet;

      await tx.matchSet.update({
        where: { id: lastPoint.setId },
        data: {
          player1Points: p1Pts,
          player2Points: p2Pts,
          // Reopen the set if the deleted point was the winning one
          status: setWon ? "FINISHED" : "IN_PROGRESS",
          winnerId: setWon
            ? (p1Pts >= pointsToWinSet ? set.match.player1Id : null)
            : null,
        },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
