export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FINISH_TYPE_POINTS } from "@/lib/scoring";
import type { FinishType } from "@prisma/client";

// DELETE — remove a single point entry and update set/match counters
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; pointId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const point = await prisma.matchPoint.findUnique({
    where: { id: params.pointId },
    include: { match: true, set: true },
  });

  if (!point) return NextResponse.json({ error: "Ponto não encontrado" }, { status: 404 });
  if (point.match.tournamentId !== params.id) {
    return NextResponse.json({ error: "Ponto não pertence a este torneio" }, { status: 400 });
  }

  await prisma.matchPoint.delete({ where: { id: params.pointId } });

  // Update set counters if this point belonged to a set
  if (point.setId && point.set) {
    const isPlayer1 = point.userId === point.match.player1Id;
    await prisma.matchSet.update({
      where: { id: point.setId },
      data: isPlayer1
        ? { player1Points: { decrement: point.points } }
        : { player2Points: { decrement: point.points } },
    });
  }

  return NextResponse.json({ ok: true });
}

// POST — add a point to a specific match
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; pointId: string } }
) {
  // pointId here is the matchId (reusing the route slot)
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const matchId = params.pointId;
  const { scorerId, finishType } = await req.json();

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { sets: { orderBy: { setNumber: "asc" } } },
  });

  if (!match || match.tournamentId !== params.id) {
    return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
  }

  const points = FINISH_TYPE_POINTS[finishType as FinishType];
  if (!points) return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });

  // Get or create current set
  let currentSet = match.sets.find((s) => s.status === "IN_PROGRESS");
  if (!currentSet) {
    const setNumber = match.sets.length + 1;
    if (setNumber > 3) return NextResponse.json({ error: "Máximo de sets atingido" }, { status: 400 });
    currentSet = await prisma.matchSet.create({
      data: { matchId, setNumber, status: "IN_PROGRESS" },
    });
  }

  await prisma.matchPoint.create({
    data: {
      matchId,
      userId: scorerId,
      finishType: finishType as FinishType,
      points,
      setId: currentSet.id,
    },
  });

  const isPlayer1 = scorerId === match.player1Id;
  await prisma.matchSet.update({
    where: { id: currentSet.id },
    data: isPlayer1
      ? { player1Points: { increment: points } }
      : { player2Points: { increment: points } },
  });

  return NextResponse.json({ ok: true });
}
