// Heavy tournament work (standings, round generation, ranking): give it room on big events.
export const maxDuration = 60;
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { authorizeMatchOp } from "@/lib/matchAccess";
import { prisma } from "@/lib/prisma";
import { withObservability } from "@/lib/observability";

// Remove the most recent point from the current active set.
// Works only while the match is IN_PROGRESS.
// Authorized: ORGANIZER, match judge, or tournament organizer.
async function deleteHandler(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  { const denied = await denyOutsideCommunity(session, { matchId: params.id }); if (denied) return denied; }
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const match = await prisma.match.findUnique({
    where: { id: params.id },
    include: { tournament: { select: { organizerId: true, pointsToWinSet: true, _count: { select: { judges: true } } } } },
  });

  if (!match) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
  // Shared server-side rule (lib/matchPolicy): no assigned judge no longer
  // means "anyone logged in"; open judging is an explicit event setting.
  const access = await authorizeMatchOp(session, params.id, "undo");
  if (!access.ok) return access.response;
  if (match.status === "FINISHED") {
    return NextResponse.json({ error: "Partida já finalizada — use o painel admin para editar" }, { status: 400 });
  }

  const pointsToWinSet = match.pointsToWinSet ?? match.tournament.pointsToWinSet;

  try {
  await prisma.$transaction(async (tx) => {
    // Serialize with point/W.O. on the same match.
    await tx.$queryRaw`SELECT id FROM "Match" WHERE id = ${params.id} FOR UPDATE`;
    const now = await tx.match.findUnique({ where: { id: params.id }, select: { status: true } });
    if (now?.status === "FINISHED") throw new Error("MATCH_FINISHED");
    // Read the last point UNDER the lock: two undos (or an undo racing a new
    // point) can't remove the wrong one or the same one twice.
    const lastPoint = await tx.matchPoint.findFirst({ where: { matchId: params.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    if (!lastPoint) throw new Error("NO_POINT");
    await tx.matchPoint.delete({ where: { id: lastPoint.id } });
    await tx.matchAuditLog.create({
      data: {
        tournamentId: match.tournamentId, matchId: params.id, actorId: access.actor.id, actorRole: access.as, op: "undo_point",
        before: { pointId: lastPoint.id, userId: lastPoint.userId, finishType: lastPoint.finishType, points: lastPoint.points, setId: lastPoint.setId },
      },
    });

    if (lastPoint.setId) {
      // Recalculate set points from remaining MatchPoints
      const remaining = await tx.matchPoint.findMany({ where: { setId: lastPoint.setId } });
      const setPointCount = remaining.length;
      const p1Pts = remaining.filter((p) => p.userId === match.player1Id).reduce((s, p) => s + p.points, 0);
      const p2Pts = remaining.filter((p) => p.userId !== match.player1Id).reduce((s, p) => s + p.points, 0);

      if (setPointCount === 0) {
        // The set is now empty — remove it so the next point recreates set N cleanly.
        await tx.matchSet.delete({ where: { id: lastPoint.setId } });
      } else {
        const p1Won = p1Pts >= pointsToWinSet;
        const p2Won = p2Pts >= pointsToWinSet;
        const setWon = p1Won || p2Won;
        await tx.matchSet.update({
          where: { id: lastPoint.setId },
          data: {
            player1Points: p1Pts,
            player2Points: p2Pts,
            // Reopen the set if the deleted point was the winning one.
            status: setWon ? "FINISHED" : "IN_PROGRESS",
            // Correctly credit whichever player crossed the threshold (was a bug
            // that dropped player 2's win and orphaned the set).
            winnerId: p1Won ? match.player1Id : p2Won ? match.player2Id : null,
          },
        });
      }
    }

    // If no points remain in the whole match, send it back to PENDING so it no
    // longer shows as "Ao Vivo" with an empty scoreboard.
    const remainingForMatch = await tx.matchPoint.count({ where: { matchId: params.id } });
    if (remainingForMatch === 0) {
      await tx.matchSet.deleteMany({ where: { matchId: params.id } });
      await tx.match.update({ where: { id: params.id }, data: { status: "PENDING", winnerId: null } });
    }
  });
  } catch (e) {
    if (String(e).includes("NO_POINT")) return NextResponse.json({ error: "Nenhum ponto para desfazer" }, { status: 400 });
    if (String(e).includes("MATCH_FINISHED")) {
      return NextResponse.json({ error: "Partida já finalizada — use o painel admin para editar" }, { status: 409 });
    }
    throw e;
  }

  return NextResponse.json({ ok: true });
}

export const DELETE = withObservability("/api/matches/[id]/undo-point", deleteHandler);
