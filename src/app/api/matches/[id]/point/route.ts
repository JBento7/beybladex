export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FINISH_TYPE_POINTS } from "@/lib/scoring";
import { recalculateStandings, advanceSingleElimination, generateSwissRound, finalizeRoundRobin, finalizeTournamentRanking, updateBeybladeStats } from "@/lib/tournament-engine";
import type { FinishType } from "@prisma/client";

const POINTS_TO_WIN_SET = 4;
const SETS_TO_WIN = 2;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { scorerId, finishType, beybladeId } = await req.json();
    if (!scorerId || !finishType) {
      return NextResponse.json({ error: "scorerId e finishType são obrigatórios" }, { status: 400 });
    }

    const match = await prisma.match.findUnique({
      where: { id: params.id },
      include: {
        tournament: true,
        sets: { orderBy: { setNumber: "asc" } },
      },
    });

    if (!match) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
    if (
      match.tournament.organizerId !== session.user.id &&
      session.user.role !== "ORGANIZER" &&
      !session.user.canJudge
    ) {
      return NextResponse.json({ error: "Apenas organizadores podem registrar pontos" }, { status: 403 });
    }
    if (match.status === "FINISHED") {
      return NextResponse.json({ error: "Partida já finalizada" }, { status: 400 });
    }
    if (scorerId !== match.player1Id && scorerId !== match.player2Id) {
      return NextResponse.json({ error: "Jogador inválido" }, { status: 400 });
    }

    const points = FINISH_TYPE_POINTS[finishType as FinishType];
    if (!points) return NextResponse.json({ error: "Tipo de finish inválido" }, { status: 400 });

    if (!match.sets.find((s) => s.status === "IN_PROGRESS") && match.sets.length + 1 > 3) {
      return NextResponse.json({ error: "Número máximo de sets atingido" }, { status: 400 });
    }

    let matchFinished = false;
    let matchWinnerId: string | null = null;

    // Get or create current set, register the point and update set/match state atomically.
    const updatedSet = await prisma.$transaction(async (tx) => {
      let currentSet = match.sets.find((s) => s.status === "IN_PROGRESS");
      if (!currentSet) {
        const setNumber = match.sets.length + 1;
        currentSet = await tx.matchSet.create({
          data: {
            matchId: params.id,
            setNumber,
            status: "IN_PROGRESS",
          },
        });
        // Update match to IN_PROGRESS
        await tx.match.update({
          where: { id: params.id },
          data: { status: "IN_PROGRESS" },
        });
      }

      // Add point to the set
      await tx.matchPoint.create({
        data: {
          matchId: params.id,
          userId: scorerId,
          finishType: finishType as FinishType,
          points,
          setId: currentSet.id,
          beybladeId: beybladeId || null,
        },
      });

      // Update set point counters
      const isPlayer1 = scorerId === match.player1Id;
      return tx.matchSet.update({
        where: { id: currentSet.id },
        data: isPlayer1
          ? { player1Points: { increment: points } }
          : { player2Points: { increment: points } },
      });
    });

    // Check if set is won
    const p1Pts = updatedSet.player1Points;
    const p2Pts = updatedSet.player2Points;
    if (p1Pts >= POINTS_TO_WIN_SET || p2Pts >= POINTS_TO_WIN_SET) {
      const setWinnerId = p1Pts >= POINTS_TO_WIN_SET ? match.player1Id : match.player2Id;

      const { p1Sets, p2Sets } = await prisma.$transaction(async (tx) => {
        await tx.matchSet.update({
          where: { id: updatedSet.id },
          data: { status: "FINISHED", winnerId: setWinnerId },
        });

        // Count sets won
        const allSets = await tx.matchSet.findMany({ where: { matchId: params.id } });
        return {
          p1Sets: allSets.filter((s) => s.winnerId === match.player1Id).length,
          p2Sets: allSets.filter((s) => s.winnerId === match.player2Id).length,
        };
      });

      if (p1Sets >= SETS_TO_WIN || p2Sets >= SETS_TO_WIN) {
        // Match is over
        matchWinnerId = p1Sets >= SETS_TO_WIN ? match.player1Id : match.player2Id;
        matchFinished = true;

        await prisma.match.update({
          where: { id: params.id },
          data: { status: "FINISHED", winnerId: matchWinnerId },
        });

        await Promise.all([
          recalculateStandings(match.tournamentId, match.player1Id),
          recalculateStandings(match.tournamentId, match.player2Id),
        ]);

        // Update beyblade win/loss stats (skip for test tournaments — those shouldn't affect global combo stats)
        if (!match.tournament.isTest) {
          const matchLoserId = matchWinnerId === match.player1Id ? match.player2Id : match.player1Id;
          await updateBeybladeStats(params.id, matchWinnerId, matchLoserId);
        }

        // Format-specific post-match
        if (match.tournament.format === "ROUND_ROBIN") {
          await finalizeRoundRobin(match.tournamentId);
        } else if (match.tournament.format === "SINGLE_ELIMINATION") {
          await advanceSingleElimination(match.tournamentId, match.round);
        } else if (match.tournament.format === "SWISS") {
          const roundMatches = await prisma.match.findMany({
            where: { tournamentId: match.tournamentId, round: match.round },
          });
          const allDone = roundMatches.every((m) => m.status === "FINISHED");
          if (allDone) {
            const participantCount = await prisma.tournamentParticipant.count({
              where: { tournamentId: match.tournamentId },
            });
            const maxRounds = Math.ceil(Math.log2(participantCount));
            if (match.round < maxRounds) {
              await generateSwissRound(match.tournamentId, match.round + 1);
            } else {
              await finalizeTournamentRanking(match.tournamentId);
            }
          }
        } else {
          const allMatches = await prisma.match.findMany({
            where: { tournamentId: match.tournamentId },
          });
          const allDone = allMatches.every((m) => m.status === "FINISHED");
          if (allDone) {
            await finalizeTournamentRanking(match.tournamentId);
          }
        }
      }
    }

    return NextResponse.json({ success: true, matchFinished, winnerId: matchWinnerId });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
