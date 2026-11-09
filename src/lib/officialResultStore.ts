// Server side of the official result (docs/RESULTADO-OFICIAL.md): diagnosis of
// one event (final, stored placements, correction, monthly ranking), the
// audited correction (simulate → apply in one transaction, idempotent) and
// its removal. Never touches other tournaments or other months.
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { computeTournamentRankingDetailed, getSwissRounds, monthClosedFor } from "./tournament-engine";
import { isMonthClosed, lockMonth, monthlyScopeOf } from "./monthlyRanking";
import { revalidateRankings } from "./leagueRanking";
import { isSwissFormat } from "./swiss";
import { activeCorrection, findFinal, finalIssues, resolveOfficialPodium, type OfficialCorrection } from "./officialResult";

const nameOf = (u: { name: string; bladerName: string | null } | null | undefined) => (u ? u.bladerName || u.name : "—");

/** Everything needed to compare the records of one event (read-only). */
export async function diagnoseResult(tournamentId: string) {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      id: true, name: true, status: true, format: true, qualifiers: true, isOfficial: true, isTest: true, doubleRankingPoints: true,
      communitySlug: true, isPartnership: true, startDate: true, createdAt: true, rankingPointsTable: true, officialResult: true,
      participants: { where: { approved: { not: false } }, select: { userId: true, placement: true, rankingPoints: true, user: { select: { name: true, bladerName: true } } } },
      matches: {
        select: {
          id: true, round: true, status: true, player1Id: true, player2Id: true, winnerId: true, isWalkover: true, isThirdPlace: true, updatedAt: true,
          sets: { select: { setNumber: true, player1Points: true, player2Points: true, winnerId: true }, orderBy: { setNumber: "asc" } },
        },
      },
    },
  });
  if (!t) return null;
  const users = new Map(t.participants.map((p) => [p.userId, nameOf(p.user)]));
  const who = (id: string | null | undefined) => (id ? { userId: id, name: users.get(id) ?? "—" } : null);
  const swissRounds = isSwissFormat(t.format) ? await getSwissRounds(t.id, t.participants.length) : 0;
  const matches = t.matches.map((m) => ({ ...m, setWinners: m.sets.map((s) => s.winnerId) }));
  const { final } = findFinal(matches, t.format === "SINGLE_ELIMINATION" ? 0 : swissRounds);
  const stored = t.participants.map((p) => ({ userId: p.userId, placement: p.placement }));
  const displayed = resolveOfficialPodium({ format: t.format, status: t.status, swissRounds, matches, placements: stored, correction: t.officialResult });
  const fromMatches = resolveOfficialPodium({ format: t.format, status: t.status, swissRounds, matches, placements: stored, correction: null });
  const storedFirst = t.participants.find((p) => p.placement === 1)?.userId ?? null;
  const scope = monthlyScopeOf(t);
  const closed = await monthClosedFor(t.id);
  const actions = await prisma.tournamentAdminAction.findMany({
    where: { tournamentId: t.id, kind: { in: ["OFFICIAL_RESULT", "OFFICIAL_RESULT_REMOVED", "PODIUM_OVERRIDE", "RANKING_RECALC", "RESULT_CHANGED_AFTER_ADVANCE"] } },
    orderBy: { createdAt: "desc" }, take: 20, select: { kind: true, reason: true, actorId: true, createdAt: true },
  }).catch(() => []);
  const matchAudit = final?.id
    ? await prisma.matchAuditLog.findMany({ where: { matchId: final.id }, orderBy: { createdAt: "desc" }, take: 10, select: { op: true, actorRole: true, createdAt: true } }).catch(() => [])
    : [];
  const warnings: string[] = [];
  if (displayed.pending) warnings.push(displayed.pending);
  if (displayed.first && storedFirst && storedFirst !== displayed.first) warnings.push("A classificação armazenada (1º colocado e pontos) diverge do campeão oficial: recalcule ou aplique a correção oficial.");
  if (closed) warnings.push(`O ranking mensal ${closed.league.toUpperCase()} · ${closed.month} está encerrado: recálculos e correções não alteram mais esse mês.`);
  return {
    tournament: { id: t.id, name: t.name, status: t.status, format: t.format, qualifiers: t.qualifiers, swissRounds, isOfficial: t.isOfficial, isTest: t.isTest, doubleRankingPoints: t.doubleRankingPoints, monthly: scope, monthClosed: !!closed },
    final: final ? {
      id: final.id, round: final.round, status: final.status, isWalkover: !!final.isWalkover,
      player1: who(final.player1Id), player2: who(final.player2Id), winner: who(final.winnerId),
      sets: (t.matches.find((m) => m.id === final.id)?.sets ?? []).map((s) => ({ set: s.setNumber, p1: s.player1Points, p2: s.player2Points, winner: who(s.winnerId)?.name ?? null })),
      issues: finalIssues(final),
    } : null,
    comparison: {
      finalWinner: who(final?.winnerId),
      storedFirst: who(storedFirst),
      displayedChampion: who(displayed.first),
      displayedSource: displayed.source,
      matchesChampion: who(fromMatches.first),
    },
    correction: activeCorrection(t.officialResult, t.participants.map((p) => p.userId)),
    standings: t.participants
      .slice().sort((a, b) => (a.placement ?? 999) - (b.placement ?? 999))
      .map((p) => ({ userId: p.userId, name: nameOf(p.user), placement: p.placement, rankingPoints: p.rankingPoints })),
    actions, finalAudit: matchAudit, warnings,
  };
}

export type CorrectionPlan = {
  ok: true;
  changes: { userId: string; name: string; placementNow: number | null; placementAfter: number; pointsNow: number; pointsAfter: number }[];
  unchanged: number;
  champion: { userId: string; name: string } | null;
};
type Fail = { ok: false; status: number; error: string };

function validateOrder(order: unknown, participants: string[]): string[] | Fail {
  const list = Array.isArray(order) ? order.filter((x): x is string => typeof x === "string" && !!x) : [];
  if (list.length === 0) return { ok: false, status: 400, error: "Informe ao menos o 1º colocado." };
  if (new Set(list).size !== list.length) return { ok: false, status: 400, error: "O mesmo jogador aparece em duas posições." };
  if (list.some((u) => !participants.includes(u))) return { ok: false, status: 400, error: "Há jogador(es) que não participam deste torneio." };
  return list;
}

/**
 * Official correction of the podium (order = userIds from 1st place).
 * dryRun → before/after only. Real run, in ONE transaction under the monthly
 * lock: stores the correction (reason, admin, date), rewrites placement and
 * ranking points of THIS event from its frozen table (× "Pontuação dobrada",
 * replacing — never adding to — the stored values), and records before/after
 * (the backup of the affected records) in TournamentAdminAction. Repeating the
 * same correction changes nothing. A closed month is never modified.
 */
export async function correctResult(input: { tournamentId: string; order: unknown; reason: unknown; actorId: string; dryRun: boolean; remove?: boolean }): Promise<CorrectionPlan | Fail> {
  const t = await prisma.tournament.findUnique({
    where: { id: input.tournamentId },
    select: { id: true, status: true, officialResult: true, isOfficial: true, isTest: true, isPartnership: true, communitySlug: true, startDate: true, createdAt: true, participants: { where: { approved: { not: false } }, select: { userId: true } } },
  });
  if (!t) return { ok: false, status: 404, error: "Torneio não encontrado." };
  if (t.status !== "FINISHED") return { ok: false, status: 400, error: "Só é possível corrigir o resultado de um torneio encerrado." };
  const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 500) : "";
  if (!reason) return { ok: false, status: 400, error: "Informe o motivo da correção." };
  const ids = t.participants.map((p) => p.userId);
  let correction: OfficialCorrection | null = null;
  if (!input.remove) {
    const order = validateOrder(input.order, ids);
    if (!Array.isArray(order)) return order;
    correction = { order, reason, actorId: input.actorId, at: new Date().toISOString() };
  } else if (!activeCorrection(t.officialResult, ids)) {
    return { ok: false, status: 400, error: "Este torneio não tem correção oficial ativa." };
  }
  const scope = monthlyScopeOf(t);

  return prisma.$transaction(async (tx): Promise<CorrectionPlan | Fail> => {
    if (scope) {
      await lockMonth(tx, scope.league, scope.month);
      if (await isMonthClosed(scope.league, scope.month, tx)) {
        return { ok: false, status: 409, error: `O ranking mensal ${scope.league.toUpperCase()} · ${scope.month} já foi encerrado. A correção não foi aplicada; uma retificação do mês arquivado exige uma operação própria.` };
      }
    }
    const before = await tx.tournamentParticipant.findMany({
      where: { tournamentId: t.id, approved: { not: false } },
      select: { id: true, userId: true, placement: true, rankingPoints: true, user: { select: { name: true, bladerName: true } } },
    });
    // The new correction (or none) is what the ranking is computed with.
    await tx.tournament.update({ where: { id: t.id }, data: { officialResult: (correction ?? null) as unknown as Prisma.InputJsonValue } });
    const detail = await computeTournamentRankingDetailed(t.id, tx);
    if (detail.blocked) throw new Abort({ ok: false, status: 409, error: `Resultado inconsistente: ${detail.blocked}` });
    const byId = new Map(before.map((p) => [p.id, p]));
    const changes = detail.placements.map((c) => {
      const cur = byId.get(c.participantId)!;
      return { userId: c.userId, name: nameOf(cur.user), placementNow: cur.placement, placementAfter: c.placement, pointsNow: cur.rankingPoints, pointsAfter: c.rankingPoints, participantId: c.participantId };
    });
    const changed = changes.filter((c) => c.placementNow !== c.placementAfter || c.pointsNow !== c.pointsAfter);
    const plan: CorrectionPlan = {
      ok: true,
      changes: changed.map(({ participantId: _p, ...r }) => r),
      unchanged: changes.length - changed.length,
      champion: changes.find((c) => c.placementAfter === 1) ? { userId: changes.find((c) => c.placementAfter === 1)!.userId, name: changes.find((c) => c.placementAfter === 1)!.name } : null,
    };
    if (input.dryRun) throw new Abort(plan); // simulation: nothing is kept
    const sameCorrection = JSON.stringify((t.officialResult as { order?: string[] } | null)?.order ?? null) === JSON.stringify(correction?.order ?? null);
    if (changed.length === 0 && sameCorrection) throw new Abort(plan); // idempotent repeat: nothing to write
    for (const c of changed) {
      await tx.tournamentParticipant.update({ where: { id: c.participantId }, data: { placement: c.placementAfter, rankingPoints: c.pointsAfter } });
    }
    await tx.tournament.update({ where: { id: t.id }, data: { stateVersion: { increment: 1 }, rankingPointsTable: detail.table } });
    await tx.tournamentAdminAction.create({
      data: {
        tournamentId: t.id, kind: input.remove ? "OFFICIAL_RESULT_REMOVED" : "OFFICIAL_RESULT", reason, actorId: input.actorId,
        before: { officialResult: t.officialResult ?? null, participants: before.map((p) => ({ userId: p.userId, placement: p.placement, rankingPoints: p.rankingPoints })) } as Prisma.InputJsonValue,
        after: { officialResult: correction ?? null, participants: changes.map((c) => ({ userId: c.userId, placement: c.placementAfter, rankingPoints: c.pointsAfter })) } as unknown as Prisma.InputJsonValue,
      },
    });
    return plan;
  }, { maxWait: 20000, timeout: 30000 }).then((r) => {
    if (r.ok && !input.dryRun) revalidateRankings();
    return r;
  }).catch((e) => {
    if (e instanceof Abort) return e.result;
    throw e;
  });
}

class Abort extends Error {
  constructor(public result: CorrectionPlan | Fail) { super("abort"); }
}
