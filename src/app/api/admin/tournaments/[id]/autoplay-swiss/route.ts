export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateSwissRound, advanceSwissTournament, swissRoundCount, recalculateStandings } from "@/lib/tournament-engine";

// Admin/test-only: simulate the whole Swiss phase of a TEST tournament (random
// winners), advancing to the knockout. Only pending matches are finished, so it
// is safe to run mid-Swiss. POST /api/admin/tournaments/<id>/autoplay-swiss
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: params.id },
      select: { id: true, format: true, status: true, isTest: true },
    });
    if (!tournament) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
    if (!tournament.isTest) return NextResponse.json({ error: "Autoplay disponível apenas em torneios de teste." }, { status: 400 });
    if (tournament.format !== "ROUND_ROBIN") return NextResponse.json({ error: "Autoplay disponível apenas no formato Suíço." }, { status: 400 });

    const participantIds = (await prisma.tournamentParticipant.findMany({
      where: { tournamentId: tournament.id, approved: { not: false } },
      select: { userId: true },
    })).map((p) => p.userId);
    if (participantIds.length < 2) return NextResponse.json({ error: "Participantes insuficientes." }, { status: 400 });

    // Start it if still in registration.
    if (tournament.status === "REGISTRATION" || tournament.status === "DRAFT") {
      await prisma.tournament.update({ where: { id: tournament.id }, data: { status: "IN_PROGRESS" } });
      const round1 = await prisma.match.count({ where: { tournamentId: tournament.id, round: 1 } });
      if (round1 === 0) await generateSwissRound(tournament.id, 1);
    }

    const swissRounds = swissRoundCount(participantIds.length);
    for (let round = 1; round <= swissRounds; round++) {
      const matches = await prisma.match.findMany({ where: { tournamentId: tournament.id, round } });
      if (matches.length === 0) break; // nothing generated for this round yet
      for (const m of matches) {
        if (m.status === "FINISHED") continue;
        const winnerId = m.player1Id === m.player2Id || Math.random() < 0.5 ? m.player1Id : m.player2Id;
        const loser = Math.floor(Math.random() * 4);
        await prisma.matchSet.create({
          data: {
            matchId: m.id, setNumber: 1, status: "FINISHED", winnerId,
            player1Points: winnerId === m.player1Id ? 4 : loser,
            player2Points: winnerId === m.player2Id ? 4 : loser,
          },
        });
        await prisma.match.update({ where: { id: m.id }, data: { winnerId, status: "FINISHED" } });
      }
      for (const uid of participantIds) await recalculateStandings(tournament.id, uid);
      // Advance only if the next round / knockout hasn't been generated yet.
      const nextExists = await prisma.match.count({ where: { tournamentId: tournament.id, round: round + 1 } });
      if (nextExists === 0) await advanceSwissTournament(tournament.id, round);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[autoplay-swiss]", err);
    return NextResponse.json({ error: `Erro no autoplay: ${String(err)}` }, { status: 500 });
  }
}
