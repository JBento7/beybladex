// 3on3 + 1 reserva — the active trio of each player in each match.
//
// Lifecycle (docs/DECK-3ON3-RESERVA.md):
//  1. PENDING match: each player (or a judge/organizer, recorded) confirms 3 of
//     their 4 registered Beyblades. Revisable any number of times; each change
//     bumps `revision` and is written to MatchAuditLog (author + before/after).
//  2. LOCK: the first "Iniciar" (countdown) or the first point locks BOTH
//     trios, under the same row lock (`SELECT … FOR UPDATE` on the Match) that
//     point/undo/W.O. use — a change can't slip in between. Both must exist
//     and be valid; a snapshot of the 3 (as registered) is stored.
//  3. After the lock: no ordinary change. An organizer may correct it with a
//     mandatory reason (audited); points already scored keep their Beyblade.
// Byes need no trio. W.O. needs no trio (it records no Beyblade usage).
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { checkTrio, hasMatchTrio, type DeckBey } from "./deckFormat";
import { registeredDeck } from "./deckRegistration";

type Tx = Prisma.TransactionClient | PrismaClient;
export type TrioError = { ok: false; status: number; error: string; code: string };

async function lockMatchRow(tx: Tx, matchId: string) {
  await tx.$queryRaw`SELECT id FROM "Match" WHERE id = ${matchId} FOR UPDATE`;
}

async function matchContext(tx: Tx, matchId: string) {
  return tx.match.findUnique({
    where: { id: matchId },
    select: {
      id: true, status: true, player1Id: true, player2Id: true, tournamentId: true,
      tournament: { select: { deckType: true, isOfficial: true } },
      _count: { select: { points: true } },
      trioSelections: true,
    },
  });
}

async function participantDeck(tx: Tx, tournamentId: string, userId: string): Promise<DeckBey[]> {
  const p = await tx.tournamentParticipant.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
    select: { beyblade1: true, beyblade2: true, beyblade3: true, beyblade4: true, deckSnapshot: true },
  });
  return p ? registeredDeck(p) : [];
}

const trioIds = (s: { bey1Id: string; bey2Id: string; bey3Id: string }) => [s.bey1Id, s.bey2Id, s.bey3Id];
export const isLocked = (sels: { lockedAt: Date | null }[]) => sels.some((s) => s.lockedAt);

/** Player (or authorized judge/organizer) confirms/revises a trio before the lock. */
export async function setTrio(opts: {
  matchId: string; userId: string; beybladeIds: unknown;
  actor: { id: string; role: string }; reason?: string | null;
}): Promise<{ ok: true; revision: number; reserveId: string; active: string[] } | TrioError> {
  return prisma.$transaction(async (tx) => {
    await lockMatchRow(tx, opts.matchId);
    const m = await matchContext(tx, opts.matchId);
    if (!m) return { ok: false, status: 404, error: "Partida não encontrada", code: "NOT_FOUND" } as const;
    if (!hasMatchTrio(m.tournament.deckType)) return { ok: false, status: 400, error: "Este torneio não usa o formato 3 on 3 + 1 reserva.", code: "NOT_PLUS_ONE" } as const;
    if (m.player1Id === m.player2Id) return { ok: false, status: 400, error: "Bye não exige trio.", code: "BYE" } as const;
    if (opts.userId !== m.player1Id && opts.userId !== m.player2Id) return { ok: false, status: 400, error: "Este jogador não está nesta partida.", code: "NOT_PLAYER" } as const;
    if (isLocked(m.trioSelections) || m.status !== "PENDING" || m._count.points > 0) {
      return { ok: false, status: 409, error: "O confronto já começou: o trio está bloqueado até o fim desta partida.", code: "LOCKED" } as const;
    }
    const deck = await participantDeck(tx, m.tournamentId, opts.userId);
    const check = checkTrio(deck, opts.beybladeIds, m.tournament.isOfficial);
    if (!check.ok) return { ok: false, status: 400, error: check.error, code: "INVALID_TRIO" } as const;

    const prev = m.trioSelections.find((s) => s.userId === opts.userId) ?? null;
    const now = new Date();
    const row = await tx.matchTrioSelection.upsert({
      where: { matchId_userId: { matchId: opts.matchId, userId: opts.userId } },
      create: {
        matchId: opts.matchId, tournamentId: m.tournamentId, userId: opts.userId,
        bey1Id: check.active[0], bey2Id: check.active[1], bey3Id: check.active[2], reserveId: check.reserve,
        confirmedAt: now, confirmedById: opts.actor.id,
      },
      update: {
        bey1Id: check.active[0], bey2Id: check.active[1], bey3Id: check.active[2], reserveId: check.reserve,
        confirmedAt: now, confirmedById: opts.actor.id, revision: { increment: 1 },
      },
    });
    // A deck order made for the previous trio is no longer valid.
    const changed = !prev || trioIds(prev).sort().join() !== [...check.active].sort().join();
    if (changed && prev) await tx.matchDeckOrder.deleteMany({ where: { matchId: opts.matchId, userId: opts.userId } });
    await tx.matchAuditLog.create({
      data: {
        tournamentId: m.tournamentId, matchId: opts.matchId, actorId: opts.actor.id, actorRole: opts.actor.role,
        op: opts.actor.id === opts.userId ? "trio_select" : "trio_select_by_staff",
        before: prev ? { userId: opts.userId, active: trioIds(prev), reserve: prev.reserveId, revision: prev.revision } : undefined,
        after: { userId: opts.userId, active: check.active, reserve: check.reserve, revision: row.revision, reason: opts.reason ?? null },
      },
    });
    return { ok: true, revision: row.revision, reserveId: check.reserve, active: check.active };
  });
}

/**
 * Locks both trios of a 3on3+1 match. Call INSIDE a transaction that already
 * holds the match row lock. Idempotent. Returns null when nothing is needed
 * (other formats, bye) or the match is already locked.
 */
export async function lockTriosTx(tx: Tx, matchId: string): Promise<null | TrioError | { ok: true; lockedNow: boolean }> {
  const m = await matchContext(tx, matchId);
  if (!m || !hasMatchTrio(m.tournament.deckType) || m.player1Id === m.player2Id) return null;
  if (isLocked(m.trioSelections)) return { ok: true, lockedNow: false };
  const sel1 = m.trioSelections.find((s) => s.userId === m.player1Id);
  const sel2 = m.trioSelections.find((s) => s.userId === m.player2Id);
  if (!sel1 || !sel2) {
    return { ok: false, status: 409, error: "Os dois jogadores precisam confirmar o trio desta partida antes do início.", code: "TRIO_MISSING" };
  }
  const now = new Date();
  for (const sel of [sel1, sel2]) {
    const deck = await participantDeck(tx, m.tournamentId, sel.userId);
    const check = checkTrio(deck, trioIds(sel), m.tournament.isOfficial);
    if (!check.ok) return { ok: false, status: 409, error: `Trio inválido: ${check.error}`, code: "TRIO_INVALID" };
    const snapshot = check.active.map((id) => deck.find((b) => b.id === id)!);
    await tx.matchTrioSelection.update({
      where: { id: sel.id },
      data: { lockedAt: now, lockedSnapshot: { active: snapshot, reserve: deck.find((b) => b.id === check.reserve) ?? null } as unknown as Prisma.InputJsonValue },
    });
  }
  await tx.matchAuditLog.create({
    data: { tournamentId: m.tournamentId, matchId, actorId: "system", actorRole: "system", op: "trio_lock", after: { [sel1.userId]: trioIds(sel1), [sel2.userId]: trioIds(sel2) } },
  });
  return { ok: true, lockedNow: true };
}

/** Same as lockTriosTx, in its own transaction (used by "Iniciar"). */
export async function lockTrios(matchId: string) {
  return prisma.$transaction(async (tx) => {
    await lockMatchRow(tx, matchId);
    return lockTriosTx(tx, matchId);
  });
}

/**
 * Point guard (inside recordPoint's transaction, row already locked): locks
 * the trios if needed and checks that the scoring Beyblade is one of the
 * scorer's 3 ACTIVE Beyblades (never the reserve, never an outside id).
 */
export async function checkPointBeyTx(tx: Tx, matchId: string, scorerId: string, beybladeId: string | null | undefined): Promise<null | TrioError> {
  const locked = await lockTriosTx(tx, matchId);
  if (locked === null) return null;
  if (!locked.ok) return locked;
  const sel = await tx.matchTrioSelection.findUnique({ where: { matchId_userId: { matchId, userId: scorerId } } });
  if (!sel) return { ok: false, status: 409, error: "Trio do jogador não definido.", code: "TRIO_MISSING" };
  if (!beybladeId) return { ok: false, status: 400, error: "Informe qual Beyblade ativa marcou o ponto (defina a ordem do deck).", code: "BEY_REQUIRED" };
  if (!trioIds(sel).includes(beybladeId)) {
    return { ok: false, status: 400, error: beybladeId === sel.reserveId ? "A reserva desta partida não pode pontuar." : "Esta Beyblade não está no trio ativo do jogador.", code: "BEY_NOT_ACTIVE" };
  }
  return null;
}

/** Organizer correction after the lock (mandatory reason, audited). Points
 *  already scored keep the Beyblade they were scored with. */
export async function correctLockedTrio(opts: {
  matchId: string; userId: string; beybladeIds: unknown; reason: string; actor: { id: string; role: string };
}): Promise<{ ok: true; removed: string[] } | TrioError> {
  return prisma.$transaction(async (tx) => {
    await lockMatchRow(tx, opts.matchId);
    const m = await matchContext(tx, opts.matchId);
    if (!m) return { ok: false, status: 404, error: "Partida não encontrada", code: "NOT_FOUND" } as const;
    if (!hasMatchTrio(m.tournament.deckType)) return { ok: false, status: 400, error: "Este torneio não usa o formato 3 on 3 + 1 reserva.", code: "NOT_PLUS_ONE" } as const;
    if (m.status === "FINISHED") return { ok: false, status: 409, error: "Partida encerrada: a formação é histórica e não é alterada.", code: "FINISHED" } as const;
    const reason = opts.reason.trim();
    if (reason.length < 5) return { ok: false, status: 400, error: "Explique o motivo da correção (mínimo 5 caracteres).", code: "REASON" } as const;
    const sel = m.trioSelections.find((s) => s.userId === opts.userId);
    if (!sel || !sel.lockedAt) return { ok: false, status: 409, error: "O trio ainda não está bloqueado — use a seleção normal.", code: "NOT_LOCKED" } as const;
    const deck = await participantDeck(tx, m.tournamentId, opts.userId);
    const check = checkTrio(deck, opts.beybladeIds, m.tournament.isOfficial);
    if (!check.ok) return { ok: false, status: 400, error: check.error, code: "INVALID_TRIO" } as const;
    const before = trioIds(sel);
    const removed = before.filter((id) => !check.active.includes(id));
    await tx.matchTrioSelection.update({
      where: { id: sel.id },
      data: {
        bey1Id: check.active[0], bey2Id: check.active[1], bey3Id: check.active[2], reserveId: check.reserve, revision: { increment: 1 },
        lockedSnapshot: { active: check.active.map((id) => deck.find((b) => b.id === id)!), reserve: deck.find((b) => b.id === check.reserve) ?? null } as unknown as Prisma.InputJsonValue,
      },
    });
    // Orders that still reference a removed Beyblade can't be used any more.
    if (removed.length) {
      await tx.matchDeckOrder.deleteMany({
        where: { matchId: opts.matchId, userId: opts.userId, OR: [{ bey1Id: { in: removed } }, { bey2Id: { in: removed } }, { bey3Id: { in: removed } }] },
      });
    }
    await tx.matchAuditLog.create({
      data: {
        tournamentId: m.tournamentId, matchId: opts.matchId, actorId: opts.actor.id, actorRole: opts.actor.role, op: "trio_correction",
        before: { userId: opts.userId, active: before, reserve: sel.reserveId },
        after: { userId: opts.userId, active: check.active, reserve: check.reserve, reason, pointsKeepTheirBeyblade: true },
      },
    });
    return { ok: true, removed };
  });
}

/**
 * What a viewer may see. A player sees their own 4 + their trio; the
 * opponent's trio only once BOTH are confirmed (or locked). Judges and
 * organizers see both. Visitors see trios only after the lock.
 */
export async function trioView(matchId: string, viewer: { id: string; staff: boolean } | null) {
  const m = await matchContext(prisma, matchId);
  if (!m || !hasMatchTrio(m.tournament.deckType)) return null;
  const bye = m.player1Id === m.player2Id;
  const locked = isLocked(m.trioSelections);
  const bothConfirmed = !!m.trioSelections.find((s) => s.userId === m.player1Id) && !!m.trioSelections.find((s) => s.userId === m.player2Id);
  const isPlayer = viewer && (viewer.id === m.player1Id || viewer.id === m.player2Id);
  const players = await Promise.all([m.player1Id, m.player2Id].map(async (uid) => {
    const sel = m.trioSelections.find((s) => s.userId === uid) ?? null;
    const own = viewer?.id === uid;
    const canSee = own || viewer?.staff || locked || (bothConfirmed && !!isPlayer);
    const deck = own || viewer?.staff ? await participantDeck(prisma, m.tournamentId, uid) : [];
    let previous: string[] | null = null;
    if (own && !locked) {
      const last = await prisma.matchTrioSelection.findFirst({
        where: { tournamentId: m.tournamentId, userId: uid, matchId: { not: matchId }, lockedAt: { not: null } },
        orderBy: { lockedAt: "desc" },
      });
      previous = last ? trioIds(last) : null;
    }
    return {
      userId: uid,
      confirmed: !!sel,
      revision: sel?.revision ?? 0,
      active: sel && canSee ? trioIds(sel) : null,
      reserveId: sel && canSee ? sel.reserveId : null,
      lockedSnapshot: locked && sel ? sel.lockedSnapshot : null,
      registered: deck,
      previousTrio: previous,
    };
  }));
  return { matchId, status: m.status, bye, locked, bothConfirmed, official: m.tournament.isOfficial, players };
}

/** For deck orders: the trio an order must match (locked or confirmed). */
export async function currentTrioOf(matchId: string, userId: string): Promise<string[] | null> {
  const sel = await prisma.matchTrioSelection.findUnique({ where: { matchId_userId: { matchId, userId } } });
  return sel ? trioIds(sel) : null;
}
