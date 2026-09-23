export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { prisma } from "@/lib/prisma";
import { recalculateStandings } from "@/lib/tournament-engine";

// GET — list all matches with points for this tournament
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  { const denied = await denyOutsideCommunity(session, { tournamentId: params.id }); if (denied) return denied; }
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
  { const denied = await denyOutsideCommunity(session, { tournamentId: params.id }); if (denied) return denied; }
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

  // Reset only real matches. A Swiss BYE is a self-match stored as already
  // FINISHED with winnerId = the player; resetting it to PENDING would leave a
  // match nobody can ever play, so the round could never complete and the
  // tournament would be stuck forever. Byes are structural, not a result.
  const byes = await prisma.match.findMany({
    where: { tournamentId: params.id },
    select: { id: true, player1Id: true, player2Id: true },
  });
  const byeIds = byes.filter((m) => m.player1Id === m.player2Id).map((m) => m.id);

  await prisma.$transaction([
    prisma.matchPoint.deleteMany({ where: { match: { tournamentId: params.id } } }),
    prisma.matchSet.deleteMany({ where: { match: { tournamentId: params.id } } }),
    prisma.match.updateMany({
      where: { tournamentId: params.id, id: { notIn: byeIds.length ? byeIds : ["__none__"] } },
      data: { status: "PENDING", winnerId: null },
    }),
  ]);

  // Recompute instead of zeroing, so the bye wins that are still on record stay
  // credited (a bye counts in the Suíço score, see recalculateStandings).
  const participants = await prisma.tournamentParticipant.findMany({
    where: { tournamentId: params.id },
    select: { userId: true },
  });
  for (const p of participants) {
    if (p.userId) await recalculateStandings(params.id, p.userId);
  }

  return NextResponse.json({ ok: true, byesKept: byeIds.length });
}
