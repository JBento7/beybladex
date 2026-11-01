// Changing an event's judging mode (docs/MODO-ARBITRAGEM.md): permission,
// lock once battles begin, audit. Used by POST /api/tournaments/[id]/display-mode.
import { prisma } from "./prisma";
import { adminInScope, type Actor } from "./matchPolicy";
import { DISPLAY_MODE_LABEL, displayModeLock, effectiveDisplayMode, parseDisplayMode } from "./displayMode";

export type ChangeResult = { status: number; body: { ok?: true; mode?: string; error?: string; code?: string } };

/** Battles began: a point was scored or a battle was started on a telão. */
export async function battlesStarted(tournamentId: string, db: Pick<typeof prisma, "matchPoint" | "match"> = prisma): Promise<boolean> {
  const [points, countdowns] = await Promise.all([
    db.matchPoint.count({ where: { match: { tournamentId } } }),
    db.match.count({ where: { tournamentId, countdownAt: { not: null } } }),
  ]);
  return points > 0 || countdowns > 0;
}

/**
 * Allowed for the event's organizer or an admin in scope, until matches
 * effectively start. Under the tournament row lock (can't race the first
 * battle's mode check). Each change is recorded in TournamentAdminAction.
 */
export async function changeDisplayMode(tournamentId: string, rawMode: unknown, actor: Actor | null): Promise<ChangeResult> {
  if (!actor) return { status: 401, body: { error: "Não autorizado" } };
  const mode = parseDisplayMode(rawMode);
  if (!mode) return { status: 400, body: { error: "Modo inválido." } };
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { organizerId: true, communitySlug: true, isPartnership: true } });
  if (!t) return { status: 404, body: { error: "Torneio não encontrado" } };
  if (!(adminInScope(actor, t) || t.organizerId === actor.id)) {
    return { status: 403, body: { error: "Apenas o organizador do torneio ou um administrador pode alterar o modo de arbitragem." } };
  }
  return prisma.$transaction(async (tx): Promise<ChangeResult> => {
    await tx.$queryRaw`SELECT id FROM "Tournament" WHERE id = ${tournamentId} FOR UPDATE`;
    const cur = await tx.tournament.findUnique({ where: { id: tournamentId }, select: { status: true, displayMode: true } });
    if (!cur) return { status: 404, body: { error: "Torneio não encontrado" } };
    const before = effectiveDisplayMode(cur.displayMode);
    if (before === mode) return { status: 200, body: { ok: true, mode } };
    const locked = displayModeLock({ status: cur.status, battlesStarted: await battlesStarted(tournamentId, tx) });
    if (locked) return { status: 409, body: { error: `Não é possível alterar o modo de arbitragem. ${locked}`, code: "DISPLAY_MODE_LOCKED" } };
    await tx.tournament.update({ where: { id: tournamentId }, data: { displayMode: mode, stateVersion: { increment: 1 } } });
    await tx.tournamentAdminAction.create({
      data: { tournamentId, kind: "DISPLAY_MODE", reason: `Modo de arbitragem: ${DISPLAY_MODE_LABEL[mode]}`, actorId: actor.id, before: { displayMode: before }, after: { displayMode: mode } },
    });
    return { status: 200, body: { ok: true, mode } };
  });
}
