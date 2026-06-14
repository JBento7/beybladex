export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST — wipe all matches/results from a test tournament and reopen
// registration, so admins can reuse it to test the site's flows again.
// Restricted to test tournaments (isTest: true) and ORGANIZER users.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "ORGANIZER") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
    if (!tournament) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
    if (!tournament.isTest) {
      return NextResponse.json({ error: "Apenas torneios de teste podem ser reiniciados" }, { status: 400 });
    }

    const matches = await prisma.match.findMany({
      where: { tournamentId: params.id },
      select: { id: true },
    });
    const matchIds = matches.map((m) => m.id);

    await prisma.$transaction([
      prisma.matchPoint.deleteMany({ where: { matchId: { in: matchIds } } }),
      prisma.matchSet.deleteMany({ where: { matchId: { in: matchIds } } }),
      prisma.match.deleteMany({ where: { tournamentId: params.id } }),
      prisma.group.deleteMany({ where: { tournamentId: params.id } }),
      prisma.tournamentParticipant.updateMany({
        where: { tournamentId: params.id },
        data: { totalPoints: 0, wins: 0, losses: 0, rankingPoints: 0, placement: null, groupId: null },
      }),
      prisma.tournament.update({
        where: { id: params.id },
        data: { status: "REGISTRATION" },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
