// Transactional point recording, shared by the API and the integration tests.
import type { FinishType } from "@prisma/client";
import { prisma } from "./prisma";
import { applyPoint } from "./swiss";
import { checkPointBeyTx } from "./matchTrio";

export type PointOutcome =
  | { kind: "error"; status: number; error: string; code?: string }
  | { kind: "replay"; matchFinished: boolean; winnerId: string | null }
  | { kind: "ok"; finishedNow: boolean; winnerId: string | null };

/** What the judge saw when tapping: the set and how many battles of it were
 *  already scored. A retry of an old tap can't land in another set/battle. */
export type PointContext = { setNumber: number; battle: number };

/**
 * Records one point. Everything that decides the outcome happens in ONE
 * transaction holding a row lock on the match: two devices, a double tap, a
 * retry or a W.O. arriving together are serialized and each sees what the
 * previous one committed. Re-sending the same `actionId` stores nothing new.
 * Only the call that closes the match gets finishedNow=true (so standings,
 * stats and advancement run exactly once). With `context`, a NEW action is
 * refused (409 CONTEXT_CHANGED) when the match moved on since the tap (other
 * set or battle): a late resend never scores in the wrong place.
 */
export async function recordPoint(
  matchId: string,
  p: { scorerId: string; finishType: FinishType; points: number; beybladeId?: string | null; actionId?: string | null; setsToWin: number; pointsToWinSet: number; context?: PointContext | null },
  audit?: { actorId: string; actorRole: string }
): Promise<PointOutcome> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Match" WHERE id = ${matchId} FOR UPDATE`;
    if (p.actionId) {
      const seen = await tx.matchPoint.findFirst({ where: { matchId, actionId: p.actionId }, select: { id: true } });
      if (seen) {
        const m = await tx.match.findUnique({ where: { id: matchId }, select: { status: true, winnerId: true } });
        return { kind: "replay", matchFinished: m?.status === "FINISHED", winnerId: m?.winnerId ?? null } as const;
      }
    }
    const fresh = await tx.match.findUnique({
      where: { id: matchId },
      select: { status: true, player1Id: true, player2Id: true, sets: { orderBy: { setNumber: "asc" } } },
    });
    if (!fresh) return { kind: "error", status: 404, error: "Partida não encontrada" } as const;
    const decision = applyPoint({
      player1Id: fresh.player1Id,
      player2Id: fresh.player2Id,
      matchStatus: fresh.status,
      sets: fresh.sets.map((x) => ({ setNumber: x.setNumber, status: x.status as "IN_PROGRESS" | "FINISHED", player1Points: x.player1Points, player2Points: x.player2Points, winnerId: x.winnerId })),
      setsToWin: p.setsToWin,
      pointsToWinSet: p.pointsToWinSet,
      scorerId: p.scorerId,
      points: p.points,
    });
    if ("error" in decision) return { kind: "error", status: fresh.status === "FINISHED" ? 409 : 400, error: decision.error, code: fresh.status === "FINISHED" ? "MATCH_FINISHED" : "INVALID" } as const;
    if (p.context) {
      const current = fresh.sets.find((x) => x.status === "IN_PROGRESS");
      const battle = decision.newSet || !current ? 0 : await tx.matchPoint.count({ where: { setId: current.id } });
      if (p.context.setNumber !== decision.setNumber || p.context.battle !== battle) {
        return {
          kind: "error", status: 409, code: "CONTEXT_CHANGED",
          error: `O placar mudou desde o toque (agora: set ${decision.setNumber}, batalha ${battle + 1}). O lançamento não foi aplicado — confira o placar.`,
        } as const;
      }
    }
    // 3on3 + 1 reserva: the first point locks both trios (same row lock, so a
    // trio change can't race it) and every point must come from one of the
    // scorer's 3 ACTIVE Beyblades — never the reserve (lib/matchTrio).
    {
      const trioErr = await checkPointBeyTx(tx, matchId, p.scorerId, p.beybladeId);
      if (trioErr) return { kind: "error", status: trioErr.status, error: trioErr.error } as const;
    }

    let setId: string;
    if (decision.newSet) {
      const created = await tx.matchSet.create({ data: { matchId, setNumber: decision.setNumber, status: "IN_PROGRESS" } });
      setId = created.id;
      if (fresh.status === "PENDING") await tx.match.update({ where: { id: matchId }, data: { status: "IN_PROGRESS" } });
    } else {
      setId = fresh.sets.find((x) => x.status === "IN_PROGRESS")!.id;
    }
    await tx.matchPoint.create({
      data: { matchId, userId: p.scorerId, finishType: p.finishType, points: p.points, setId, beybladeId: p.beybladeId ?? null, actionId: p.actionId ?? null },
    });
    if (audit) {
      const t = await tx.match.findUnique({ where: { id: matchId }, select: { tournamentId: true } });
      await tx.matchAuditLog.create({
        data: {
          tournamentId: t!.tournamentId, matchId, actorId: audit.actorId, actorRole: audit.actorRole, op: "point",
          before: { setNumber: decision.setNumber },
          after: { scorerId: p.scorerId, finishType: p.finishType, points: p.points, setNumber: decision.setNumber, player1Points: decision.player1Points, player2Points: decision.player2Points, setWinnerId: decision.setWinnerId, matchWinnerId: decision.matchWinnerId },
        },
      });
    }
    await tx.matchSet.update({
      where: { id: setId },
      data: {
        player1Points: decision.player1Points,
        player2Points: decision.player2Points,
        ...(decision.setWinnerId ? { status: "FINISHED" as const, winnerId: decision.setWinnerId } : {}),
      },
    });
    if (decision.matchWinnerId) {
      // Sets decide the match (not total battle points).
      await tx.match.update({ where: { id: matchId }, data: { status: "FINISHED", winnerId: decision.matchWinnerId, scoreVersion: { increment: 1 } } });
      return { kind: "ok", finishedNow: true, winnerId: decision.matchWinnerId } as const;
    }
    await tx.match.update({ where: { id: matchId }, data: { scoreVersion: { increment: 1 } } });
    return { kind: "ok", finishedNow: false, winnerId: null } as const;
    // Wait longer for a free connection so a busy pool (many arena polls /
    // heartbeats) doesn't fail with "Unable to start a transaction in time".
  }, { maxWait: 20000, timeout: 20000 });
}

/** W.O. with the same row lock: it can't race a final point. */
export async function recordWalkover(matchId: string, winnerId: string, audit?: { actorId: string; actorRole: string }): Promise<boolean> {
  const res = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Match" WHERE id = ${matchId} FOR UPDATE`;
    const before = await tx.match.findUnique({ where: { id: matchId }, select: { tournamentId: true, status: true, winnerId: true } });
    const r = await tx.match.updateMany({ where: { id: matchId, status: { not: "FINISHED" } }, data: { status: "FINISHED", winnerId, isWalkover: true, scoreVersion: { increment: 1 } } });
    if (r.count === 1 && audit && before) {
      await tx.matchAuditLog.create({
        data: { tournamentId: before.tournamentId, matchId, actorId: audit.actorId, actorRole: audit.actorRole, op: "walkover", before: { status: before.status, winnerId: before.winnerId }, after: { status: "FINISHED", winnerId, isWalkover: true } },
      });
    }
    return r;
  });
  return res.count === 1;
}

export type UndoOutcome =
  | { kind: "ok"; removed: { pointId: string; userId: string; finishType: string; points: number } }
  | { kind: "replay" }
  | { kind: "error"; status: number; code: string; error: string };

/**
 * Removes the most recent point of an unfinished match, under the same row
 * lock as scoring. `expectedPointId` = the launch the judge saw as the last
 * one: if anything else was scored (or undone) meanwhile, nothing is removed
 * (409 LAST_CHANGED). `opId` identifies the undo: repeating it is a no-op, so
 * a double tap or a resend can never remove two different points.
 */
export async function undoLastPoint(
  matchId: string,
  o: { expectedPointId?: string | null; opId?: string | null; pointsToWinSet: number },
  audit: { actorId: string; actorRole: string }
): Promise<UndoOutcome> {
  return prisma.$transaction(async (tx): Promise<UndoOutcome> => {
    await tx.$queryRaw`SELECT id FROM "Match" WHERE id = ${matchId} FOR UPDATE`;
    const match = await tx.match.findUnique({ where: { id: matchId }, select: { status: true, tournamentId: true, player1Id: true, player2Id: true } });
    if (!match) return { kind: "error", status: 404, code: "NOT_FOUND", error: "Partida não encontrada" };
    if (o.opId) {
      const done = await tx.matchAuditLog.findFirst({ where: { matchId, op: "undo_point", after: { path: ["opId"], equals: o.opId } }, select: { id: true } });
      if (done) return { kind: "replay" };
    }
    if (match.status === "FINISHED") {
      return { kind: "error", status: 409, code: "MATCH_FINISHED", error: "Partida finalizada. Solicite a correção à organização." };
    }
    // Read the last point UNDER the lock: two undos (or an undo racing a new
    // point) can't remove the wrong one or the same one twice.
    const lastPoint = await tx.matchPoint.findFirst({ where: { matchId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    if (!lastPoint) return { kind: "error", status: 400, code: "NO_POINT", error: "Nenhum lançamento para desfazer." };
    if (o.expectedPointId && lastPoint.id !== o.expectedPointId) {
      return { kind: "error", status: 409, code: "LAST_CHANGED", error: "Outro lançamento aconteceu antes do desfazer. Nada foi removido — o painel foi atualizado." };
    }
    await tx.matchPoint.delete({ where: { id: lastPoint.id } });
    await tx.matchAuditLog.create({
      data: {
        tournamentId: match.tournamentId, matchId, actorId: audit.actorId, actorRole: audit.actorRole, op: "undo_point",
        before: { pointId: lastPoint.id, userId: lastPoint.userId, finishType: lastPoint.finishType, points: lastPoint.points, setId: lastPoint.setId, actionId: lastPoint.actionId },
        after: { opId: o.opId ?? null },
      },
    });

    if (lastPoint.setId) {
      // Recalculate set points from the remaining points of that set.
      const remaining = await tx.matchPoint.findMany({ where: { setId: lastPoint.setId } });
      const p1Pts = remaining.filter((p) => p.userId === match.player1Id).reduce((s, p) => s + p.points, 0);
      const p2Pts = remaining.filter((p) => p.userId !== match.player1Id).reduce((s, p) => s + p.points, 0);
      if (remaining.length === 0) {
        // The set is now empty — remove it so the next point recreates set N cleanly.
        await tx.matchSet.delete({ where: { id: lastPoint.setId } });
      } else {
        const p1Won = p1Pts >= o.pointsToWinSet;
        const p2Won = p2Pts >= o.pointsToWinSet;
        await tx.matchSet.update({
          where: { id: lastPoint.setId },
          data: {
            player1Points: p1Pts,
            player2Points: p2Pts,
            // Reopen the set if the deleted point was the winning one.
            status: p1Won || p2Won ? "FINISHED" : "IN_PROGRESS",
            winnerId: p1Won ? match.player1Id : p2Won ? match.player2Id : null,
          },
        });
      }
    }
    // No points left: back to PENDING so it no longer shows as "Ao Vivo".
    const left = await tx.matchPoint.count({ where: { matchId } });
    if (left === 0) {
      await tx.matchSet.deleteMany({ where: { matchId } });
      await tx.match.update({ where: { id: matchId }, data: { status: "PENDING", winnerId: null, scoreVersion: { increment: 1 } } });
    } else {
      await tx.match.update({ where: { id: matchId }, data: { scoreVersion: { increment: 1 } } });
    }
    return { kind: "ok", removed: { pointId: lastPoint.id, userId: lastPoint.userId, finishType: lastPoint.finishType, points: lastPoint.points } };
  }, { maxWait: 20000, timeout: 20000 });
}

/** Has this point action been stored? (recovery after a lost response) */
export async function actionStatus(matchId: string, actionId: string): Promise<{ processed: boolean }> {
  const seen = await prisma.matchPoint.findFirst({ where: { matchId, actionId }, select: { id: true } });
  if (seen) return { processed: true };
  // Applied and then undone: still "processed" (it must not be sent again).
  const undone = await prisma.matchAuditLog.findFirst({ where: { matchId, op: "undo_point", before: { path: ["actionId"], equals: actionId } }, select: { id: true } });
  return { processed: !!undone };
}
