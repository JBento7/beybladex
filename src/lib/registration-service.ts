// Transactional registration (shared by the join API and the integration tests).
import { prisma } from "./prisma";
import { registrationState } from "./registration";

export type JoinResult =
  | { ok: true; participantId: string }
  | { ok: false; status: number; code: string; error: string; alreadyRegistered?: boolean };

/**
 * Takes a spot: locks the tournament row, re-checks status/deadline/capacity
 * with the shared rule, inserts, bumps the event version — one transaction.
 * The unique (tournamentId, userId) key turns a duplicate submit into
 * "Você já está inscrito" instead of a second registration.
 */
export async function claimRegistrationSpot(
  tournamentId: string,
  userId: string,
  data: { beyblade1: string | null; beyblade2: string | null; beyblade3: string | null; approved: boolean },
  now?: number
): Promise<JoinResult> {
  try {
    return await prisma.$transaction(async (tx): Promise<JoinResult> => {
      await tx.$queryRaw`SELECT id FROM "Tournament" WHERE id = ${tournamentId} FOR UPDATE`;
      const t = await tx.tournament.findUnique({ where: { id: tournamentId }, select: { status: true, registrationDeadline: true, maxParticipants: true } });
      if (!t) return { ok: false, status: 404, code: "NOT_FOUND", error: "Torneio não encontrado" };
      const mine = await tx.tournamentParticipant.findUnique({ where: { tournamentId_userId: { tournamentId, userId } }, select: { approved: true } });
      if (mine) return { ok: false, status: 409, code: mine.approved === false ? "PENDING" : "APPROVED", error: mine.approved === false ? "Aguardando aprovação" : "Você já está inscrito", alreadyRegistered: true };
      const count = await tx.tournamentParticipant.count({ where: { tournamentId } });
      const st = registrationState({ status: t.status, registrationDeadline: t.registrationDeadline, maxParticipants: t.maxParticipants, participantCount: count, now });
      if (!st.open) {
        return { ok: false, status: 409, code: st.code, error: st.code === "FULL" ? "Torneio lotado: a última vaga acabou de ser ocupada por outra pessoa." : st.message! };
      }
      const p = await tx.tournamentParticipant.create({ data: { tournamentId, userId, ...data }, select: { id: true } });
      await tx.tournament.update({ where: { id: tournamentId }, data: { stateVersion: { increment: 1 } } });
      return { ok: true, participantId: p.id };
    }, { maxWait: 10000, timeout: 15000 });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return { ok: false, status: 409, code: "APPROVED", error: "Você já está inscrito", alreadyRegistered: true };
    }
    throw e;
  }
}
