// Server side of the deck-order rule (lib/displayMode, docs/MODO-ARBITRAGEM.md).
// Checked where a battle can begin or be scored — the official start of a
// battle and every point — so hiding a field in the interface is never what
// enforces it. Everything runs under the Match row lock held by the caller.
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { registeredDeckSize } from "./deckFormat";
import {
  battlePosition, effectiveDisplayMode, missingDeckOrders, missingOrderMessage, requiresDeckOrder,
  type DisplayMode,
} from "./displayMode";
import { lockTriosTx } from "./matchTrio";

type Tx = Prisma.TransactionClient | PrismaClient;
export type GateError = { ok: false; status: number; error: string; code: string; missing?: { userId: string; name: string }[] };

const nameOf = (u: { name: string; bladerName: string | null }) => u.bladerName || u.name;

/**
 * Players still missing the deck order for the battle at `pos` (ARENA + a
 * format with an ordered deck; nothing otherwise). `pos` defaults to the
 * battle the match is at now.
 */
export async function deckOrderGateTx(tx: Tx, matchId: string, pos?: { setNumber: number; battle: number }): Promise<null | GateError> {
  const m = await tx.match.findUnique({
    where: { id: matchId },
    select: {
      player1Id: true, player2Id: true, tournamentId: true,
      tournament: { select: { displayMode: true, deckType: true } },
      sets: { select: { setNumber: true, status: true, _count: { select: { points: true } } } },
    },
  });
  if (!m || m.player1Id === m.player2Id) return null;
  if (!requiresDeckOrder(m.tournament.displayMode, m.tournament.deckType)) return null;
  const at = pos
    ? { setNumber: pos.setNumber, cycleIndex: Math.floor(pos.battle / 3) }
    : battlePosition(m.sets.map((s) => ({ setNumber: s.setNumber, status: s.status, points: s._count.points })));
  const size = registeredDeckSize(m.tournament.deckType);
  const [parts, orders] = await Promise.all([
    tx.tournamentParticipant.findMany({
      where: { tournamentId: m.tournamentId, userId: { in: [m.player1Id, m.player2Id] } },
      select: { userId: true, beyblade1: true, beyblade2: true, beyblade3: true, beyblade4: true },
    }),
    tx.matchDeckOrder.findMany({ where: { matchId, setNumber: at.setNumber, cycleIndex: at.cycleIndex }, select: { userId: true, setNumber: true, cycleIndex: true } }),
  ]);
  const deckSize = (uid: string) => {
    const p = parts.find((x) => x.userId === uid);
    return p ? [p.beyblade1, p.beyblade2, p.beyblade3, p.beyblade4].slice(0, size).filter(Boolean).length : 0;
  };
  const missing = missingDeckOrders({
    mode: m.tournament.displayMode, deckType: m.tournament.deckType, bye: false,
    setNumber: at.setNumber, cycleIndex: at.cycleIndex,
    players: [m.player1Id, m.player2Id].map((userId) => ({ userId, deckSize: deckSize(userId) })),
    orders,
  });
  if (missing.length === 0) return null;
  const users = await tx.user.findMany({ where: { id: { in: missing } }, select: { id: true, name: true, bladerName: true } });
  const named = missing.map((id) => ({ userId: id, name: nameOf(users.find((u) => u.id === id) ?? { name: "Jogador", bladerName: null }) }));
  return { ok: false, status: 409, code: "DECK_ORDER_MISSING", error: missingOrderMessage(named.map((x) => x.name)), missing: named };
}

class Rollback extends Error {
  constructor(public result: GateError) { super(result.code); }
}

/**
 * Official start of a battle (both modes). In one transaction under the row
 * lock: trios (3on3 + 1 reserva — required in ARENA, locked when declared in
 * JUDGE_ONLY), then the deck order of this battle (ARENA only). A refusal
 * rolls everything back, so a trio is never locked by a start that didn't
 * happen.
 */
export async function startBattleGate(matchId: string): Promise<{ ok: true; mode: DisplayMode } | GateError> {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Match" WHERE id = ${matchId} FOR UPDATE`;
      const m = await tx.match.findUnique({ where: { id: matchId }, select: { status: true, player1Id: true, player2Id: true, tournament: { select: { displayMode: true } } } });
      if (!m) throw new Rollback({ ok: false, status: 404, error: "Partida não encontrada", code: "NOT_FOUND" });
      if (m.status === "FINISHED") throw new Rollback({ ok: false, status: 409, error: "Partida finalizada.", code: "MATCH_FINISHED" });
      if (m.player1Id === m.player2Id) throw new Rollback({ ok: false, status: 400, error: "Bye não tem batalha.", code: "BYE" });
      const lock = await lockTriosTx(tx, matchId);
      if (lock && !lock.ok) throw new Rollback({ ok: false, status: lock.status, error: lock.error, code: lock.code });
      const gate = await deckOrderGateTx(tx, matchId);
      if (gate) throw new Rollback(gate);
      return { ok: true as const, mode: effectiveDisplayMode(m.tournament.displayMode) };
    }, { maxWait: 15000, timeout: 15000 });
  } catch (e) {
    if (e instanceof Rollback) return e.result;
    throw e;
  }
}

/** Telão-only operations (PRONTOS, countdown, videos, on-air heartbeat,
 *  stadium sides) are refused for a "Somente placar do juiz" event: nothing
 *  of it may reach a telão, even from an old page or a stale request. */
export async function telaoOnlyGate(matchId: string): Promise<null | GateError> {
  const m = await prisma.match.findUnique({ where: { id: matchId }, select: { tournament: { select: { displayMode: true } } } }).catch(() => null);
  if (m && effectiveDisplayMode(m.tournament.displayMode) === "JUDGE_ONLY") {
    return { ok: false, status: 409, code: "BROADCAST_DISABLED", error: "Este torneio usa “Somente placar do juiz”: nada é enviado às telas das arenas." };
  }
  return null;
}
