// Transactional point recording, shared by the API and the integration tests.
import type { FinishType } from "@prisma/client";
import { prisma } from "./prisma";
import { applyPoint } from "./swiss";
import { checkPointBeyTx } from "./matchTrio";

export type PointOutcome =
  | { kind: "error"; status: number; error: string }
  | { kind: "replay"; matchFinished: boolean; winnerId: string | null }
  | { kind: "ok"; finishedNow: boolean; winnerId: string | null };

/**
 * Records one point. Everything that decides the outcome happens in ONE
 * transaction holding a row lock on the match: two devices, a double tap, a
 * retry or a W.O. arriving together are serialized and each sees what the
 * previous one committed. Re-sending the same `actionId` stores nothing new.
 * Only the call that closes the match gets finishedNow=true (so standings,
 * stats and advancement run exactly once).
 */
export async function recordPoint(
  matchId: string,
  p: { scorerId: string; finishType: FinishType; points: number; beybladeId?: string | null; actionId?: string | null; setsToWin: number; pointsToWinSet: number },
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
    if ("error" in decision) return { kind: "error", status: fresh.status === "FINISHED" ? 409 : 400, error: decision.error } as const;
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
      await tx.match.update({ where: { id: matchId }, data: { status: "FINISHED", winnerId: decision.matchWinnerId } });
      return { kind: "ok", finishedNow: true, winnerId: decision.matchWinnerId } as const;
    }
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
    const r = await tx.match.updateMany({ where: { id: matchId, status: { not: "FINISHED" } }, data: { status: "FINISHED", winnerId, isWalkover: true } });
    if (r.count === 1 && audit && before) {
      await tx.matchAuditLog.create({
        data: { tournamentId: before.tournamentId, matchId, actorId: audit.actorId, actorRole: audit.actorRole, op: "walkover", before: { status: before.status, winnerId: before.winnerId }, after: { status: "FINISHED", winnerId, isWalkover: true } },
      });
    }
    return r;
  });
  return res.count === 1;
}
