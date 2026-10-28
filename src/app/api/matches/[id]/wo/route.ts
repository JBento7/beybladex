// Heavy tournament work (standings, round generation, ranking): give it room on big events.
export const maxDuration = 60;
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { authorizeMatchOp } from "@/lib/matchAccess";
import { prisma } from "@/lib/prisma";
import { isSwissFormat } from "@/lib/swiss";
import { recordWalkover } from "@/lib/match-scoring";
import { recalculateStandings, advanceSingleElimination, generateSwissRound, advanceSwissTournament, finalizeTournamentRanking, updateBeybladeStats } from "@/lib/tournament-engine";
import { withObservability } from "@/lib/observability";

// POST — declare a walkover (W.O.): the opponent of `winnerId` didn't show up,
// so the match is finished without playing any sets.
async function postHandler(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    { const denied = await denyOutsideCommunity(session, { matchId: params.id }); if (denied) return denied; }
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { winnerId } = await req.json();
    if (!winnerId) {
      return NextResponse.json({ error: "winnerId é obrigatório" }, { status: 400 });
    }

    const match = await prisma.match.findUnique({
      where: { id: params.id },
      include: { tournament: { include: { _count: { select: { judges: true } } } } },
    });

    if (!match) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
    // Shared server-side rule (lib/matchPolicy): no assigned judge no longer
    // means "anyone logged in"; open judging is an explicit event setting.
    const access = await authorizeMatchOp(session, params.id, "walkover");
    if (!access.ok) return access.response;
    if (match.status === "FINISHED") {
      return NextResponse.json({ error: "Partida já finalizada" }, { status: 400 });
    }
    if (winnerId !== match.player1Id && winnerId !== match.player2Id) {
      return NextResponse.json({ error: "O vencedor deve ser um dos jogadores da partida" }, { status: 400 });
    }
    if (match.player1Id === match.player2Id) {
      return NextResponse.json({ error: "Não é possível dar W.O. em uma partida de bye" }, { status: 400 });
    }

    // Conditional write: two concurrent W.O.s (or a W.O. racing the last point)
    // must not both close the match.
    // Same row lock as point scoring: a W.O. and a final point can't both
    // close the match. Points already recorded are kept as history; under the
    // published rules they are not battle points (the match wasn't completed).
    const closedNow = await recordWalkover(params.id, winnerId, { actorId: access.actor.id, actorRole: access.as });
    if (!closedNow) {
      return NextResponse.json({ error: "Partida já finalizada" }, { status: 409 });
    }

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

    if (isSwissFormat(tournament.format)) {
      await advanceSwissTournament(match.tournamentId, match.round);
    } else if (tournament.format === "SINGLE_ELIMINATION") {
      await advanceSingleElimination(match.tournamentId, match.round);
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

export const POST = withObservability("/api/matches/[id]/wo", postHandler);
