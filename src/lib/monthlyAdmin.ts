// Admin operations on the monthly rankings (docs/RANKING-MENSAL.md):
// point adjustments, player/month resets, rules and closing. Every write runs
// in ONE transaction holding the month lock (lockMonth), so concurrent
// operations on the same league+month are serialized; other leagues/months are
// independent. Each operation is keyed by the client's request id: a repeated
// click or a resent request returns the first result and writes nothing.
import type { Session } from "next-auth";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { revalidateRankings } from "./leagueRanking";
import { logEvent } from "./observability";
import {
  computeLiveMonthly, effectiveRules, lockMonth, monthTournamentWhere, playerMonthlyTotal, type ArchivedRow,
} from "./monthlyRanking";
import { currentMonth, isMonth, isMonthlyLeague, isTiebreak, parsePointsTable, type MonthlyLeague, type Tiebreak } from "./monthlyRules";

export class MonthlyError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const ADJUST_KINDS = ["ADD", "REMOVE", "RESET_PLAYER", "RESET_MONTH"] as const;
export type AdjustKind = (typeof ADJUST_KINDS)[number];
export const MAX_ADJUST_POINTS = 100000;

/** Organizers only; a league-scoped admin manages only their own league. */
export function canManageLeague(session: Session | null, league: string): boolean {
  if (!session || session.user.role !== "ORGANIZER") return false;
  const scope = session.user.adminCommunity;
  return !scope || scope === league;
}

/** Common input checks; throws MonthlyError with a message for the admin. */
export function checkTarget(session: Session | null, league: unknown, month: unknown): { league: MonthlyLeague; month: string } {
  if (!session || session.user.role !== "ORGANIZER") throw new MonthlyError(403, "Não autorizado.");
  if (!isMonthlyLeague(league)) throw new MonthlyError(400, "Liga inválida. Use LBL ou LBM.");
  if (!canManageLeague(session, league)) throw new MonthlyError(403, `Seu acesso de admin é só da ${String(session.user.adminCommunity).toUpperCase()}.`);
  if (!isMonth(month)) throw new MonthlyError(400, "Mês inválido. Use o formato AAAA-MM.");
  return { league, month };
}

function checkReason(reason: unknown): string {
  const r = typeof reason === "string" ? reason.trim() : "";
  if (r.length < 3) throw new MonthlyError(400, "Informe o motivo (pelo menos 3 caracteres).");
  return r.slice(0, 500);
}
function checkRequestId(id: unknown): string {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(id)) throw new MonthlyError(400, "Requisição inválida. Recarregue a página e tente de novo.");
  return id;
}
function notFuture(month: string, what: string) {
  if (month > currentMonth()) throw new MonthlyError(400, `Não é possível ${what} um mês futuro.`);
}

async function periodFor(tx: Prisma.TransactionClient, league: MonthlyLeague, month: string) {
  return tx.rankingPeriod.upsert({
    where: { communitySlug_month: { communitySlug: league, month } },
    create: { communitySlug: league, month },
    update: {},
  });
}

/** A request already applied → its operations (replay), else null. */
async function replayOf(tx: Prisma.TransactionClient, requestId: string, league: MonthlyLeague, month: string) {
  const ops = await tx.rankingOperation.findMany({ where: { requestId }, include: { period: { select: { communitySlug: true, month: true } } } });
  if (ops.length === 0) return null;
  if (ops.some((o) => o.period.communitySlug !== league || o.period.month !== month)) throw new MonthlyError(409, "Esta requisição já foi usada em outro mês ou liga.");
  return ops;
}

const TX = { maxWait: 20000, timeout: 30000 } as const;

export type AdjustInput = { league: MonthlyLeague; month: string; requestId: unknown; kind: unknown; userId?: unknown; points?: unknown; reason: unknown; actorId: string };
export type AdjustResult = { replayed: boolean; kind: AdjustKind; changes: { userId: string; before: number; delta: number; after: number }[] };

/**
 * Adds/removes points or zeroes a player / the whole month, always as
 * adjustment rows (tournament results are never touched). Totals can't go
 * negative: removing more than the balance is refused, zeroing writes the
 * exact compensating amount (e.g. total 120 → adjustment -120 → 0).
 */
export async function applyAdjustment(input: AdjustInput): Promise<AdjustResult> {
  const { league, month, actorId } = input;
  const requestId = checkRequestId(input.requestId);
  const reason = checkReason(input.reason);
  if (typeof input.kind !== "string" || !(ADJUST_KINDS as readonly string[]).includes(input.kind)) throw new MonthlyError(400, "Operação inválida.");
  const kind = input.kind as AdjustKind;
  notFuture(month, "ajustar");
  let userId: string | null = null;
  let amount = 0;
  if (kind !== "RESET_MONTH") {
    if (typeof input.userId !== "string" || !input.userId) throw new MonthlyError(400, "Selecione o jogador.");
    userId = input.userId;
  }
  if (kind === "ADD" || kind === "REMOVE") {
    const n = typeof input.points === "number" ? input.points : Number(input.points);
    if (!Number.isInteger(n) || n < 1 || n > MAX_ADJUST_POINTS) throw new MonthlyError(400, `Informe uma quantidade inteira de 1 a ${MAX_ADJUST_POINTS} pontos.`);
    amount = n;
  }
  if (userId) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { isGuest: true, deleted: true } });
    if (!u || u.isGuest || u.deleted) throw new MonthlyError(404, "Jogador não encontrado.");
  }

  const result = await prisma.$transaction(async (tx): Promise<AdjustResult> => {
    await lockMonth(tx, league, month);
    const prior = await replayOf(tx, requestId, league, month);
    if (prior) {
      return {
        replayed: true, kind,
        changes: prior.filter((o) => o.userId).map((o) => {
          const b = (o.before as { total?: number } | null)?.total ?? 0;
          return { userId: o.userId!, before: b, delta: o.points, after: b + o.points };
        }),
      };
    }
    const period = await periodFor(tx, league, month);
    if (period.closedAt) throw new MonthlyError(409, "Este mês já foi encerrado. O ranking arquivado não pode ser alterado.");

    const targets: { userId: string; before: number; delta: number }[] = [];
    if (kind === "RESET_MONTH") {
      const live = await computeLiveMonthly(league, month, tx);
      for (const e of live) if (e.points > 0) targets.push({ userId: e.id, before: e.points, delta: -e.points });
      if (targets.length === 0) throw new MonthlyError(400, "Nenhum jogador tem pontos neste mês.");
    } else {
      const { total } = await playerMonthlyTotal(league, month, userId!, tx);
      if (kind === "ADD") targets.push({ userId: userId!, before: total, delta: amount });
      else if (kind === "REMOVE") {
        if (amount > total) throw new MonthlyError(400, `Saldo insuficiente: o jogador tem ${total} ponto(s) neste mês.`);
        targets.push({ userId: userId!, before: total, delta: -amount });
      } else {
        if (total <= 0) throw new MonthlyError(400, "O jogador já está com zero pontos neste mês.");
        targets.push({ userId: userId!, before: total, delta: -total });
      }
    }
    for (const t of targets) {
      await tx.rankingOperation.create({
        data: {
          periodId: period.id, requestId,
          idempotencyKey: kind === "RESET_MONTH" ? `${requestId}:${t.userId}` : requestId,
          kind, userId: t.userId, points: t.delta, reason, actorId,
          before: { total: t.before }, after: { total: t.before + t.delta },
        },
      });
    }
    return { replayed: false, kind, changes: targets.map((t) => ({ ...t, after: t.before + t.delta })) };
  }, TX).catch((e) => {
    // Two identical requests racing: the second hits the unique key → same as a replay.
    if ((e as { code?: string })?.code === "P2002") throw new MonthlyError(409, "Esta operação já foi registrada. Recarregue para ver o resultado.");
    throw e;
  });

  if (!result.replayed) {
    revalidateRankings();
    logEvent("monthly_ranking_adjust", { league, month, kind, actorId, players: result.changes.length });
  }
  return result;
}

export type RulesInput = { league: MonthlyLeague; month: string; requestId: unknown; pointsTable: unknown; tiebreak: unknown; reason: unknown; actorId: string };

/** New rules from this month on (inherited by the following months until
 *  changed). They apply to the next finalizations only: events already
 *  finalized keep the table frozen when they were finalized. */
export async function setRules(input: RulesInput): Promise<{ replayed: boolean }> {
  const { league, month, actorId } = input;
  const requestId = checkRequestId(input.requestId);
  const reason = checkReason(input.reason);
  const parsed = parsePointsTable(input.pointsTable);
  if (!parsed.ok) throw new MonthlyError(400, parsed.error);
  if (!isTiebreak(input.tiebreak)) throw new MonthlyError(400, "Critério de desempate inválido.");
  const tiebreak: Tiebreak = input.tiebreak;

  const replayed = await prisma.$transaction(async (tx) => {
    await lockMonth(tx, league, month);
    if (await replayOf(tx, requestId, league, month)) return true;
    const period = await periodFor(tx, league, month);
    if (period.closedAt) throw new MonthlyError(409, "Este mês já foi encerrado. As regras dele não podem mudar.");
    const before = await effectiveRules(league, month, tx);
    await tx.rankingPeriod.update({ where: { id: period.id }, data: { pointsTable: parsed.table, tiebreak } });
    await tx.rankingOperation.create({
      data: {
        periodId: period.id, requestId, idempotencyKey: requestId, kind: "RULES", reason, actorId,
        before: { pointsTable: before.pointsTable, tiebreak: before.tiebreak, fromMonth: before.fromMonth },
        after: { pointsTable: parsed.table, tiebreak },
      },
    });
    return false;
  }, TX);
  if (!replayed) {
    revalidateRankings();
    logEvent("monthly_ranking_rules", { league, month, actorId, places: parsed.table.length, tiebreak });
  }
  return { replayed };
}

/** Official events of the month still taking sign-ups or being played. */
export async function openEventsOf(league: MonthlyLeague, month: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  return db.tournament.findMany({
    where: { ...monthTournamentWhere(league, month), status: { in: ["REGISTRATION", "IN_PROGRESS"] } },
    select: { id: true, name: true, status: true },
    orderBy: { createdAt: "asc" },
  });
}

export type CloseInput = { league: MonthlyLeague; month: string; requestId: unknown; expectedLeaderId: unknown; actorId: string };

/**
 * Closes a month: recomputes the classification on the server, checks that
 * the leader is the one the admin confirmed, archives the full table
 * (positions, players as they are now, points, wins, losses) with the rules,
 * champion, admin and date. Afterwards nothing can change that month.
 */
export async function closeMonth(input: CloseInput): Promise<{ replayed: boolean; champion: ArchivedRow }> {
  const { league, month, actorId } = input;
  const requestId = checkRequestId(input.requestId);
  notFuture(month, "fechar");

  const out = await prisma.$transaction(async (tx) => {
    await lockMonth(tx, league, month);
    const prior = await replayOf(tx, requestId, league, month);
    if (prior) {
      const p = await tx.rankingPeriod.findUniqueOrThrow({ where: { communitySlug_month: { communitySlug: league, month } } });
      const rows = ((p.standings as unknown as { rows?: ArchivedRow[] } | null)?.rows ?? []);
      return { replayed: true, champion: rows[0] };
    }
    const period = await periodFor(tx, league, month);
    if (period.closedAt) throw new MonthlyError(409, "Este mês já foi encerrado.");
    const open = await openEventsOf(league, month, tx);
    if (open.length > 0) {
      throw new MonthlyError(409, `Ainda há torneio(s) oficial(is) deste mês em inscrições ou em andamento: ${open.map((t) => t.name).join(", ")}. Finalize-os antes de fechar o mês.`);
    }
    const rules = await effectiveRules(league, month, tx);
    const rows = await computeLiveMonthly(league, month, tx, rules);
    if (rows.length === 0) throw new MonthlyError(400, "Nenhum jogador pontuou neste mês. Não há campeão para definir.");
    const champion = rows[0];
    if (typeof input.expectedLeaderId === "string" && input.expectedLeaderId !== champion.id) {
      throw new MonthlyError(409, `A classificação mudou: o líder agora é ${champion.name} (${champion.points} pts). Confira e confirme novamente.`);
    }
    const closedAt = new Date();
    await tx.rankingPeriod.update({
      where: { id: period.id },
      data: {
        standings: { rules, rows, closedAt: closedAt.toISOString() } as unknown as Prisma.InputJsonValue,
        championUserId: champion.id, closedAt, closedById: actorId,
      },
    });
    await tx.rankingOperation.create({
      data: {
        periodId: period.id, requestId, idempotencyKey: requestId, kind: "CLOSE", userId: champion.id, points: 0,
        reason: "Fechamento do mês", actorId,
        after: { championUserId: champion.id, championName: champion.name, points: champion.points, players: rows.length },
      },
    });
    return { replayed: false, champion };
  }, TX);
  if (!out.replayed) {
    revalidateRankings();
    logEvent("monthly_ranking_close", { league, month, actorId, players: 1 });
  }
  return out;
}

/** History of a month (newest first) with player/admin names. */
export async function operationsOf(league: MonthlyLeague, month: string) {
  const period = await prisma.rankingPeriod.findUnique({ where: { communitySlug_month: { communitySlug: league, month } }, select: { id: true } });
  if (!period) return [];
  const ops = await prisma.rankingOperation.findMany({ where: { periodId: period.id }, orderBy: { createdAt: "desc" }, take: 200 });
  const ids = [...new Set(ops.flatMap((o) => [o.userId, o.actorId]).filter((x): x is string => !!x))];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, bladerName: true } });
  const nameOf = new Map(users.map((u) => [u.id, u.bladerName || u.name]));
  return ops.map((o) => ({
    id: o.id, kind: o.kind, points: o.points, reason: o.reason, createdAt: o.createdAt.toISOString(),
    player: o.userId ? nameOf.get(o.userId) ?? "—" : null, admin: nameOf.get(o.actorId) ?? "—",
    before: o.before, after: o.after,
  }));
}
