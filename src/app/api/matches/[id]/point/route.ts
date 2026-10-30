// Heavy tournament work (standings, round generation, ranking): give it room on big events.
export const maxDuration = 60;
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse, after } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { authorizeMatchOp } from "@/lib/matchAccess";
import { prisma } from "@/lib/prisma";
import { FINISH_TYPE_POINTS } from "@/lib/scoring";
import { recalculateStandings, advanceSingleElimination, advanceSwissTournament, finalizeTournamentRanking, updateBeybladeStats } from "@/lib/tournament-engine";
import { isSwissFormat } from "@/lib/swiss";
import { actionStatus, recordPoint, type PointContext } from "@/lib/match-scoring";
import { loadMatchState } from "@/lib/matchState";
import { errorResponse, logEvent, withObservability } from "@/lib/observability";
import type { FinishType } from "@prisma/client";

async function postHandler(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    { const denied = await denyOutsideCommunity(session, { matchId: params.id }); if (denied) return denied; }
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { scorerId, finishType, beybladeId, actionId: rawActionId, context: rawContext } = await req.json();
    if (!scorerId || !finishType) {
      return NextResponse.json({ error: "scorerId e finishType são obrigatórios" }, { status: 400 });
    }
    const actionId = typeof rawActionId === "string" && rawActionId.length <= 100 ? rawActionId : null;
    // The set/battle the judge saw when tapping (lib/match-scoring PointContext).
    const context: PointContext | null =
      rawContext && Number.isInteger(rawContext.setNumber) && Number.isInteger(rawContext.battle)
        ? { setNumber: rawContext.setNumber, battle: rawContext.battle }
        : null;

    const match = await prisma.match.findUnique({
      where: { id: params.id },
      include: { tournament: { include: { _count: { select: { judges: true } } } } },
    });

    if (!match) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
    // Shared server-side rule (lib/matchPolicy): no assigned judge no longer
    // means "anyone logged in"; open judging is an explicit event setting.
    const access = await authorizeMatchOp(session, params.id, "score");
    if (!access.ok) return access.response;
    if (match.player1Id === match.player2Id) {
      return NextResponse.json({ error: "Bye não recebe pontos" }, { status: 400 });
    }

    const points = FINISH_TYPE_POINTS[finishType as FinishType];
    if (!points) return NextResponse.json({ error: "Tipo de finish inválido" }, { status: 400 });

    const setsToWin = match.setsToWin ?? match.tournament.setsToWin;
    const pointsToWinSet = match.pointsToWinSet ?? match.tournament.pointsToWinSet;

    const outcome = await recordPoint(params.id, { scorerId, finishType: finishType as FinishType, points, beybladeId: beybladeId || null, actionId, setsToWin, pointsToWinSet, context }, { actorId: access.actor.id, actorRole: access.as });

    if (outcome.kind === "error") {
      // Refused: the official state goes along so panel and telão resync at once.
      return NextResponse.json({ error: outcome.error, code: outcome.code ?? null, state: await loadMatchState(params.id, session) }, { status: outcome.status });
    }
    if (outcome.kind === "replay") {
      // Same action already stored: nothing is added again.
      return NextResponse.json({ success: true, replay: true, matchFinished: outcome.matchFinished, winnerId: outcome.winnerId, state: await loadMatchState(params.id, session) });
    }

    // Signal the telão to play this finish's video (SPIN/OVER/BURST/EXTREME).
    // Stamped right after the point is committed — not after the post-match
    // pipeline below, which can take seconds and would make the telão replay it.
    if (["SPIN_FINISH", "OVER_FINISH", "BURST_FINISH", "EXTREME_FINISH"].includes(finishType)) {
      try {
        await prisma.match.update({
          where: { id: params.id },
          data: { finishVideoAt: new Date(), finishVideoType: finishType },
        });
      } catch { /* columns may be missing pre-migration — ignore */ }
    }

    const matchFinished = outcome.finishedNow;
    const matchWinnerId = outcome.winnerId;
    // Only the request whose transaction closed the match runs the side effects
    // (standings, stats, advance) — exactly once. They run AFTER the response:
    // the point is already committed, so the judge gets the confirmation (and
    // the official result) without waiting for standings/next round.
    if (matchFinished && matchWinnerId) {
      after(async () => {
        try {
          await Promise.all([
            recalculateStandings(match.tournamentId, match.player1Id),
            recalculateStandings(match.tournamentId, match.player2Id),
          ]);
          if (!match.tournament.isTest) {
            const matchLoserId = matchWinnerId === match.player1Id ? match.player2Id : match.player1Id;
            await updateBeybladeStats(params.id, matchWinnerId, matchLoserId);
          }
          if (isSwissFormat(match.tournament.format)) {
            await advanceSwissTournament(match.tournamentId, match.round);
          } else if (match.tournament.format === "SINGLE_ELIMINATION") {
            await advanceSingleElimination(match.tournamentId, match.round);
          } else {
            const allMatches = await prisma.match.findMany({ where: { tournamentId: match.tournamentId } });
            if (allMatches.every((m) => m.status === "FINISHED")) await finalizeTournamentRanking(match.tournamentId);
          }
        } catch (e) {
          // The result is saved; an organizer can retry the advance (RetryAdvanceButton).
          logEvent("post_match_failed", { matchId: params.id, tournamentId: match.tournamentId, err: String((e as Error)?.message ?? e).slice(0, 200) });
        }
      });
    }

    return NextResponse.json({ success: true, matchFinished, winnerId: matchWinnerId, state: await loadMatchState(params.id, session) });
  } catch (err) {
    // Full error only in the server log; the judge's screen gets a short,
    // actionable message (no database internals).
    const missingColumn = /column .*(countdown|does not exist)/i.test(String(err));
    return errorResponse("/api/matches/[id]/point", err, missingColumn ? "Banco desatualizado — avise o administrador (migrações pendentes)." : undefined, req);
  }
}

export const POST = withObservability("/api/matches/[id]/point", postHandler);

// Recovery after a lost response: was this action (actionId) already stored?
// Same authorization as scoring. Answers with the official state either way,
// so the panel can resolve a pending launch without guessing.
async function getHandler(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    { const denied = await denyOutsideCommunity(session, { matchId: params.id }); if (denied) return denied; }
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const access = await authorizeMatchOp(session, params.id, "score");
    if (!access.ok) return access.response;
    const actionId = req.nextUrl.searchParams.get("actionId") ?? "";
    if (!actionId || actionId.length > 100) return NextResponse.json({ error: "actionId obrigatório" }, { status: 400 });
    const [status, state] = await Promise.all([actionStatus(params.id, actionId), loadMatchState(params.id, session)]);
    if (!state) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
    return NextResponse.json({ processed: status.processed, state });
  } catch (err) {
    return errorResponse("/api/matches/[id]/point:GET", err, undefined, req);
  }
}

export const GET = withObservability("/api/matches/[id]/point", getHandler);
