export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recalculateStandings, advanceSingleElimination, generateSwissRound, finalizeRoundRobin, finalizeTournamentRanking, updateBeybladeStats } from "@/lib/tournament-engine";

// POST — declare a walkover (W.O.): the opponent of `winnerId` didn't show up,
// so the match is finished without playing any sets.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { winnerId } = await req.json();
    if (!winnerId) {
      return NextResponse.json({ error: "winnerId é obrigatório" }, { status: 400 });
    }

    const match = await prisma.match.findUnique({
      where: { id: params.id },
      include: { tournament: true },
    });

    if (!match) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
    if (
      match.tournament.organizerId !== session.user.id &&
      session.user.role !== "ORGANIZER" &&
      !session.user.canJudge &&
      match.judgeId !== session.user.id
    ) {
      return NextResponse.json({ error: "Apenas organizadores podem registrar W.O." }, { status: 403 });
    }
    if (match.status === "FINISHED") {
      return NextResponse.json({ error: "Partida já finalizada" }, { status: 400 });
    }
    if (winnerId !== match.player1Id && winnerId !== match.player2Id) {
      return NextResponse.json({ error: "O vencedor deve ser um dos jogadores da partida" }, { status: 400 });
    }
    if (match.player1Id === match.player2Id) {
      return NextResponse.json({ error: "Não é possível dar W.O. em uma partida de bye" }, { status: 400 });
    }

    await prisma.match.update({
      where: { id: params.id },
      data: { status: "FINISHED", winnerId, isWalkover: true },
    });

    await Promise.all([
      recalculateStandings(match.tournamentId, match.player1Id),
      recalculateStandings(match.tournamentId, match.player2Id),
    ]);

    // Credit the registered beyblades for the W.O. (resolveMatchBeyblade falls
    // back to beyblade1 since a walkover has no scored points). Skip test events.
    if (!match.tournament.isTest) {
      const loserId = winnerId === match.player1Id ? match.player2Id : match.player1Id;
      await updateBeybladeStats(params.id, winnerId, loserId);
    }

    // Format-specific post-match logic (same as the regular point/finish flow)
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

    return NextResponse.json({ success: true, winnerId });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
