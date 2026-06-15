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
        sets: { orderBy: { setNumber: "asc" } },
        tournament: { select: { setsToWin: true, pointsToWinSet: true } },
      },
    });

    if (!match) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });

    const sets = match.sets;
    const player1Sets = sets.filter((s) => s.winnerId === match.player1Id).length;
    const player2Sets = sets.filter((s) => s.winnerId === match.player2Id).length;
    const currentSet = sets.find((s) => s.status === "IN_PROGRESS") ?? null;
    const matchFinished = match.status === "FINISHED";

    return NextResponse.json({
      sets,
      currentSet,
      player1Sets,
      player2Sets,
      matchFinished,
      winnerId: match.winnerId,
      setsToWin: match.tournament.setsToWin,
      pointsToWinSet: match.tournament.pointsToWinSet,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
