export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const match = await prisma.match.findUnique({
      where: { id: params.id },
      include: {
        sets: {
          orderBy: { setNumber: "asc" },
          include: { points: { select: { id: true } } },
        },
        tournament: { select: { setsToWin: true, pointsToWinSet: true, deckType: true } },
        deckOrders: { orderBy: { cycleIndex: "asc" } },
      },
    });

    if (!match) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });

    const sets = match.sets.map(({ points: _pts, ...s }) => s);
    const player1Sets = sets.filter((s) => s.winnerId === match.player1Id).length;
    const player2Sets = sets.filter((s) => s.winnerId === match.player2Id).length;
    const currentSet = match.sets.find((s) => s.status === "IN_PROGRESS") ?? null;
    const matchFinished = match.status === "FINISHED";

    const currentSetBattleCount = currentSet ? currentSet.points.length : 0;

    return NextResponse.json({
      sets,
      currentSet: currentSet ? { ...currentSet, points: undefined } : null,
      player1Sets,
      player2Sets,
      matchFinished,
      winnerId: match.winnerId,
      setsToWin: match.tournament.setsToWin,
      pointsToWinSet: match.tournament.pointsToWinSet,
      isDeckThreeOnThree: match.tournament.deckType === "THREE_ON_THREE",
      deckOrders: match.deckOrders,
      currentSetBattleCount,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
