export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FINISH_TYPE_POINTS } from "@/lib/scoring";
import { recalculateStandings, advanceSingleElimination, generateSwissRound, finalizeRoundRobin, finalizeTournamentRanking } from "@/lib/tournament-engine";
import type { FinishType } from "@prisma/client";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { winnerId, finishType, beybladeUsed } = await req.json();

    if (!winnerId || !finishType) {
      return NextResponse.json(
        { error: "winnerId e finishType são obrigatórios" },
        { status: 400 }
      );
    }

    const match = await prisma.match.findUnique({
      where: { id: params.id },
      include: { tournament: true },
    });

    if (!match) {
      return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
    }

    if (match.tournament.organizerId !== session.user.id && session.user.role !== "ORGANIZER") {
      return NextResponse.json(
        { error: "Apenas organizadores podem registrar pontuações" },
        { status: 403 }
      );
    }

    if (match.status === "FINISHED") {
      return NextResponse.json(
        { error: "Partida já finalizada" },
        { status: 400 }
      );
    }

    if (winnerId !== match.player1Id && winnerId !== match.player2Id) {
      return NextResponse.json(
        { error: "O vencedor deve ser um dos jogadores da partida" },
        { status: 400 }
      );
    }

    const points = FINISH_TYPE_POINTS[finishType as FinishType];
    if (!points) {
      return NextResponse.json(
        { error: "Tipo de finalização inválido" },
        { status: 400 }
      );
    }

    // Create match point entry
    await prisma.matchPoint.create({
      data: {
        matchId: params.id,
        userId: winnerId,
        finishType: finishType as FinishType,
        points,
        beybladeUsed: beybladeUsed || null,
      },
    });

    // Update match status and winner
    await prisma.match.update({
      where: { id: params.id },
      data: {
        winnerId,
        status: "FINISHED",
      },
    });

    await Promise.all([
      recalculateStandings(match.tournamentId, match.player1Id),
      recalculateStandings(match.tournamentId, match.player2Id),
    ]);

    // Handle format-specific post-match logic
    const tournament = match.tournament;

    if (tournament.format === "SINGLE_ELIMINATION") {
      await advanceSingleElimination(match.tournamentId, match.round);
    } else if (tournament.format === "SWISS") {
      const roundMatches = await prisma.match.findMany({
        where: { tournamentId: match.tournamentId, round: match.round },
      });
      const allDone = roundMatches.every((m) => m.status === "FINISHED");
      if (allDone) {
        const participants = await prisma.tournamentParticipant.count({
          where: { tournamentId: match.tournamentId },
        });
        const maxRounds = Math.ceil(Math.log2(participants));
        if (match.round < maxRounds) {
          await generateSwissRound(match.tournamentId, match.round + 1);
        } else {
          await finalizeTournamentRanking(match.tournamentId);
        }
      }
    } else if (tournament.format === "ROUND_ROBIN") {
      await finalizeRoundRobin(match.tournamentId);
    } else if (tournament.format === "GROUPS") {
      const allMatches = await prisma.match.findMany({
        where: { tournamentId: match.tournamentId },
      });
      const allDone = allMatches.every((m) => m.status === "FINISHED");
      if (allDone) {
        await finalizeTournamentRanking(match.tournamentId);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
