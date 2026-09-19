export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recalculateStandings, finalizeTournamentRanking } from "@/lib/tournament-engine";

// ORGANIZER-only: recompute the FINAL ranking (placement + rankingPoints) of a
// tournament, even one already marked FINISHED. Use it to repair events that
// were finalized with the old, buggy playoff-boundary logic (which ranked a
// Suíço by "last round lost" instead of by wins). It first recomputes every
// participant's wins/points from the recorded matches, then re-runs the ranking.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: params.id },
      select: { id: true, status: true },
    });
    if (!tournament) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const participants = await prisma.tournamentParticipant.findMany({
      where: { tournamentId: params.id, approved: { not: false } },
      select: { userId: true },
    });

    // 1) Standings from the recorded matches (sequential: keeps the pool calm).
    for (const p of participants) {
      if (p.userId) await recalculateStandings(params.id, p.userId);
    }

    // 2) Final placement + ranking points.
    await finalizeTournamentRanking(params.id);

    const top = await prisma.tournamentParticipant.findMany({
      where: { tournamentId: params.id, approved: { not: false }, placement: { not: null } },
      orderBy: { placement: "asc" },
      take: 5,
      select: {
        placement: true,
        rankingPoints: true,
        totalPoints: true,
        wins: true,
        user: { select: { name: true, bladerName: true } },
      },
    });

    return NextResponse.json({
      ok: true,
      participants: participants.length,
      top: top.map((t) => ({
        placement: t.placement,
        name: t.user?.bladerName || t.user?.name || "—",
        rankingPoints: t.rankingPoints,
        wins: t.wins,
        totalPoints: t.totalPoints,
      })),
    });
  } catch (err) {
    console.error("[recalc-ranking]", err);
    return NextResponse.json({ error: `Erro ao recalcular ranking: ${String(err)}` }, { status: 500 });
  }
}
