import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FINISH_TYPE_POINTS } from "@/lib/scoring";
import { recalculateStandings, advanceSingleElimination, generateSwissRound } from "@/lib/tournament-engine";
import type { FinishType } from "@prisma/client";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { winnerId, finishType } = await req.json();

    if (!winnerId || !finishType) {
      return NextResponse.json(
        { error: "winnerId and finishType are required" },
        { status: 400 }
      );
    }

    const match = await prisma.match.findUnique({
      where: { id: params.id },
      include: { tournament: true },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    if (match.tournament.organizerId !== session.user.id) {
      return NextResponse.json(
        { error: "Only the organizer can enter scores" },
        { status: 403 }
      );
    }

    if (match.status === "FINISHED") {
      return NextResponse.json(
        { error: "Match already finished" },
        { status: 400 }
      );
    }

    if (winnerId !== match.player1Id && winnerId !== match.player2Id) {
      return NextResponse.json(
        { error: "Winner must be one of the match players" },
        { status: 400 }
      );
    }

    const points = FINISH_TYPE_POINTS[finishType as FinishType];
    if (!points) {
      return NextResponse.json(
        { error: "Invalid finish type" },
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

    // Recalculate standings for both players
    await recalculateStandings(match.tournamentId, match.player1Id);
    await recalculateStandings(match.tournamentId, match.player2Id);

    // Handle format-specific post-match logic
    const tournament = match.tournament;

    if (tournament.format === "SINGLE_ELIMINATION") {
      await advanceSingleElimination(match.tournamentId, match.round);
    } else if (tournament.format === "SWISS") {
      // Check if all matches in this round are done
      const roundMatches = await prisma.match.findMany({
        where: { tournamentId: match.tournamentId, round: match.round },
      });
      const allDone = roundMatches.every((m) => m.status === "FINISHED");
      if (allDone) {
        // Check how many rounds have been played (Swiss typically runs log2(n) rounds)
        const participants = await prisma.tournamentParticipant.count({
          where: { tournamentId: match.tournamentId },
        });
        const maxRounds = Math.ceil(Math.log2(participants));
        if (match.round < maxRounds) {
          await generateSwissRound(match.tournamentId, match.round + 1);
        } else {
          await prisma.tournament.update({
            where: { id: match.tournamentId },
            data: { status: "FINISHED" },
          });
        }
      }
    } else if (tournament.format === "ROUND_ROBIN" || tournament.format === "GROUPS") {
      // Check if all matches are done
      const allMatches = await prisma.match.findMany({
        where: { tournamentId: match.tournamentId },
      });
      const allDone = allMatches.every((m) => m.status === "FINISHED");
      if (allDone) {
        await prisma.tournament.update({
          where: { id: match.tournamentId },
          data: { status: "FINISHED" },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
