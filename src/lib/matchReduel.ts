// Reduel registration on the server (docs/REDUEL.md), shared by the API and
// the integration tests. One transaction holding the match row lock (same as
// points/undo): a Reduel and a point arriving together are serialized, and
// whichever commits second sees the first. A resend with the same opId stores
// nothing new. Points, sets, sides, deck order and reserves are not touched.
import { prisma } from "./prisma";
import { battlePosition, broadcasts } from "./displayMode";
import { decideReduel, type ReduelRequest } from "./reduelRules";

export type ReduelOutcome =
  | { kind: "ok" | "replay"; setNumber: number; battle: number; attempt: number; reduelsNow: number; at: number }
  | { kind: "error"; status: number; code: string; error: string };

export async function recordReduel(
  matchId: string,
  req: ReduelRequest & { opId: string },
  actor: { actorId: string; actorRole: string },
): Promise<ReduelOutcome> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Match" WHERE id = ${matchId} FOR UPDATE`;
    const seen = await tx.matchReduel.findUnique({ where: { opId: req.opId } });
    if (seen) {
      if (seen.matchId !== matchId) return { kind: "error", status: 409, code: "INVALID", error: "Operação inválida." } as const;
      const n = await tx.matchReduel.count({ where: { matchId, setNumber: seen.setNumber, battle: seen.battle } });
      return { kind: "replay", setNumber: seen.setNumber, battle: seen.battle, attempt: seen.attempt, reduelsNow: n, at: seen.createdAt.getTime() } as const;
    }
    const m = await tx.match.findUnique({
      where: { id: matchId },
      select: {
        tournamentId: true, status: true, player1Id: true, player2Id: true, countdownKey: true,
        tournament: { select: { displayMode: true } },
        sets: { select: { setNumber: true, status: true, _count: { select: { points: true } } } },
      },
    });
    if (!m) return { kind: "error", status: 404, code: "INVALID", error: "Partida não encontrada" } as const;
    const pos = battlePosition(m.sets.map((s) => ({ setNumber: s.setNumber, status: s.status, points: s._count.points })));
    const position = { setNumber: pos.setNumber, battle: pos.battle };
    const reduelsSoFar = await tx.matchReduel.count({ where: { matchId, setNumber: req.setNumber, battle: req.battle } });
    const d = decideReduel({ status: m.status, bye: m.player1Id === m.player2Id, position, request: req, reduelsSoFar });
    if (!d.ok) return { kind: "error", status: d.status, code: d.code, error: d.error } as const;

    const row = await tx.matchReduel.create({
      data: { matchId, tournamentId: m.tournamentId, opId: req.opId, setNumber: req.setNumber, battle: req.battle, attempt: d.annulledAttempt, actorId: actor.actorId, actorRole: actor.actorRole },
    });
    await tx.matchAuditLog.create({
      data: {
        tournamentId: m.tournamentId, matchId, actorId: actor.actorId, actorRole: actor.actorRole, op: "reduel",
        before: { setNumber: req.setNumber, battle: req.battle, attempt: d.annulledAttempt },
        after: { opId: req.opId, newAttempt: d.annulledAttempt + 1, pointsChanged: false },
      },
    });
    // scoreVersion moves so every panel reloads the state (new attempt);
    // the score itself is untouched. With the telão: the pending countdown of
    // the annulled attempt is withdrawn and the Reduel signal is stamped.
    const telao = broadcasts(m.tournament.displayMode);
    await tx.match.update({
      where: { id: matchId },
      data: {
        scoreVersion: { increment: 1 },
        ...(telao ? { reduelAt: row.createdAt, reduelKey: req.opId, countdownAt: null, countdownKey: null } : {}),
      },
    });
    return { kind: "ok", setNumber: req.setNumber, battle: req.battle, attempt: d.annulledAttempt, reduelsNow: reduelsSoFar + 1, at: row.createdAt.getTime() } as const;
  });
}

/** Reduels of the battle at `pos` and the match's recent history (newest first). */
export async function reduelView(matchId: string, pos: { setNumber: number; battle: number }) {
  try {
    const [count, recent] = await Promise.all([
      prisma.matchReduel.count({ where: { matchId, setNumber: pos.setNumber, battle: pos.battle } }),
      prisma.matchReduel.findMany({ where: { matchId }, orderBy: { createdAt: "desc" }, take: 10, select: { setNumber: true, battle: true, attempt: true, createdAt: true } }),
    ]);
    return { count, recent: recent.map((r) => ({ setNumber: r.setNumber, battle: r.battle, attempt: r.attempt, at: r.createdAt.getTime() })) };
  } catch {
    return { count: 0, recent: [] as { setNumber: number; battle: number; attempt: number; at: number }[] }; // table missing (pre-migration)
  }
}
