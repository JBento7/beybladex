export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { authorizeMatchOp } from "@/lib/matchAccess";
import { prisma } from "@/lib/prisma";
import { withObservability } from "@/lib/observability";
import { undoLastPoint } from "@/lib/match-scoring";
import { loadMatchState } from "@/lib/matchState";

// "Desfazer último lançamento" (lib/match-scoring.undoLastPoint): removes the
// most recent point while the match is unfinished. Body (optional, sent by the
// judge panel): { expectedPointId, opId } — the launch shown as the last one,
// and an id for this undo, so a newer launch is never removed by mistake and a
// repeated request never removes a second point. Finished matches: Admin only.
// Authorized: ORGANIZER, match judge, or tournament organizer (lib/matchPolicy).
async function deleteHandler(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  { const denied = await denyOutsideCommunity(session, { matchId: params.id }); if (denied) return denied; }
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const match = await prisma.match.findUnique({
    where: { id: params.id },
    select: { pointsToWinSet: true, tournament: { select: { pointsToWinSet: true } } },
  });
  if (!match) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
  const access = await authorizeMatchOp(session, params.id, "undo");
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => ({}));
  const str = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 100 ? v : null);
  const out = await undoLastPoint(
    params.id,
    { expectedPointId: str(body?.expectedPointId), opId: str(body?.opId), pointsToWinSet: match.pointsToWinSet ?? match.tournament.pointsToWinSet },
    { actorId: access.actor.id, actorRole: access.as }
  );
  const state = await loadMatchState(params.id, session);
  if (out.kind === "error") return NextResponse.json({ error: out.error, code: out.code, state }, { status: out.status });
  return NextResponse.json({ ok: true, replay: out.kind === "replay", removed: out.kind === "ok" ? out.removed : null, state });
}

export const DELETE = withObservability("/api/matches/[id]/undo-point", deleteHandler);
