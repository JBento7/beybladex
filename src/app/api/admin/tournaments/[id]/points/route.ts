export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET — list all matches with points for this tournament
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const matches = await prisma.match.findMany({
    where: { tournamentId: params.id },
    include: {
      player1: { select: { id: true, name: true } },
      player2: { select: { id: true, name: true } },
      winner: { select: { id: true, name: true } },
      points: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
      sets: { orderBy: { setNumber: "asc" } },
    },
    orderBy: [{ round: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(matches);
}

// DELETE — clear ALL points (and sets) for this tournament, reset matches to PENDING
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    select: { organizerId: true },
  });
  if (!tournament) {
    return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
  }
  if (tournament.organizerId !== session.user.id) {
    return NextResponse.json({ error: "Apenas o organizador do torneio pode zerar os pontos" }, { status: 403 });
  }

  await prisma.$transaction([
    prisma.matchPoint.deleteMany({ where: { match: { tournamentId: params.id } } }),
    prisma.matchSet.deleteMany({ where: { match: { tournamentId: params.id } } }),
    prisma.match.updateMany({
      where: { tournamentId: params.id },
      data: { status: "PENDING", winnerId: null },
    }),
    prisma.tournamentParticipant.updateMany({
      where: { tournamentId: params.id },
      data: { wins: 0, losses: 0, totalPoints: 0 },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
