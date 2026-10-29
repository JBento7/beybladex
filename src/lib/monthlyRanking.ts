// Monthly ranking of LBL and LBM (docs/RANKING-MENSAL.md).
//
// Open month  → computed live: ranking points of the league's official,
//               finished, non-test, non-partnership events of that month
//               (startDate, else creation date; São Paulo calendar) + the
//               admin adjustments of that month (RankingOperation).
// Closed month → the classification archived when it was closed (immutable,
//               names/avatars as they were).
// The partnership ranking keeps the all-time sum (lib/leagueRanking).
import { unstable_cache } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  DEFAULT_RULES, addMonths, currentMonth, isTiebreak, monthBounds, monthOfTournament, sortMonthly, storedTable,
  type MonthlyEntry, type MonthlyLeague, type MonthlyRules, type Tiebreak,
} from "./monthlyRules";

type Db = Prisma.TransactionClient | typeof prisma;

export type ArchivedRow = MonthlyEntry & { position: number };
export type MonthlyRanking = {
  league: MonthlyLeague;
  month: string;
  status: "open" | "closed";
  rules: MonthlyRules & { fromMonth: string | null };
  entries: (MonthlyEntry & { position: number })[];
  champion: { id: string; name: string; avatarUrl: string | null; points: number } | null;
  closedAt: string | null;
};

/** Does this event count for a league's monthly ranking? */
export function countsForMonthly(t: { isOfficial: boolean; isTest: boolean; isPartnership: boolean; communitySlug: string }): t is typeof t & { communitySlug: MonthlyLeague } {
  return t.isOfficial && !t.isTest && !t.isPartnership && (t.communitySlug === "lbl" || t.communitySlug === "lbm");
}

/** League + month an event scores in, or null when it doesn't count. */
export function monthlyScopeOf(t: { isOfficial: boolean; isTest: boolean; isPartnership: boolean; communitySlug: string; startDate: Date | null; createdAt: Date }): { league: MonthlyLeague; month: string } | null {
  return countsForMonthly(t) ? { league: t.communitySlug, month: monthOfTournament(t) } : null;
}

/** Rules in force for a month: the latest month ≤ it that set rules, else the defaults. */
export async function effectiveRules(league: MonthlyLeague, month: string, db: Db = prisma): Promise<MonthlyRules & { fromMonth: string | null }> {
  const p = await db.rankingPeriod.findFirst({
    where: { communitySlug: league, month: { lte: month }, NOT: { pointsTable: { equals: Prisma.DbNull } } },
    orderBy: { month: "desc" },
    select: { month: true, pointsTable: true, tiebreak: true },
  });
  const table = p ? storedTable(p.pointsTable) : null;
  if (!p || !table) return { ...DEFAULT_RULES, fromMonth: null };
  return { pointsTable: table, tiebreak: isTiebreak(p.tiebreak) ? p.tiebreak : DEFAULT_RULES.tiebreak, fromMonth: p.month };
}

/** Serializes every write to one league's month (adjustments, closing, finalizations). */
export async function lockMonth(tx: Prisma.TransactionClient, league: MonthlyLeague, month: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ranking-month:${league}:${month}`}))`;
}

export async function isMonthClosed(league: MonthlyLeague, month: string, db: Db = prisma): Promise<boolean> {
  const p = await db.rankingPeriod.findUnique({ where: { communitySlug_month: { communitySlug: league, month } }, select: { closedAt: true } });
  return !!p?.closedAt;
}

/** Tournaments of the league's month that score in it (filter for Prisma). */
export function monthTournamentWhere(league: MonthlyLeague, month: string): Prisma.TournamentWhereInput {
  const b = monthBounds(month);
  return {
    isOfficial: true, isTest: false, isPartnership: false, communitySlug: league,
    OR: [
      { startDate: { gte: b.wallFrom, lt: b.wallTo } },
      { startDate: null, createdAt: { gte: b.instantFrom, lt: b.instantTo } },
    ],
  };
}

/** Live classification of an open month (also what closing archives). */
export async function computeLiveMonthly(league: MonthlyLeague, month: string, db: Db = prisma, rules?: MonthlyRules): Promise<(MonthlyEntry & { position: number })[]> {
  const r = rules ?? (await effectiveRules(league, month, db));
  const [results, period] = await Promise.all([
    db.tournamentParticipant.groupBy({
      by: ["userId"],
      where: { tournament: { ...monthTournamentWhere(league, month), status: "FINISHED" }, user: { isGuest: false, deleted: false } },
      _sum: { rankingPoints: true, wins: true, losses: true },
    }),
    db.rankingPeriod.findUnique({ where: { communitySlug_month: { communitySlug: league, month } }, select: { id: true } }),
  ]);
  const adjustments = period
    ? await db.rankingOperation.groupBy({ by: ["userId"], where: { periodId: period.id, userId: { not: null } }, _sum: { points: true } })
    : [];
  const byUser = new Map<string, { t: number; a: number; w: number; l: number }>();
  for (const x of results) byUser.set(x.userId, { t: x._sum.rankingPoints ?? 0, a: 0, w: x._sum.wins ?? 0, l: x._sum.losses ?? 0 });
  for (const x of adjustments) {
    if (!x.userId) continue;
    const cur = byUser.get(x.userId) ?? { t: 0, a: 0, w: 0, l: 0 };
    cur.a += x._sum.points ?? 0;
    byUser.set(x.userId, cur);
  }
  const users = await db.user.findMany({
    where: { id: { in: [...byUser.keys()] }, isGuest: false, deleted: false, NOT: [{ email: { endsWith: ".arena" } }, { email: { endsWith: ".juiz" } }] },
    select: { id: true, name: true, bladerName: true, avatarUrl: true },
  });
  const list: MonthlyEntry[] = users.map((u) => {
    const v = byUser.get(u.id)!;
    return { id: u.id, name: u.bladerName || u.name, avatarUrl: u.avatarUrl, tournamentPoints: v.t, adjustmentPoints: v.a, points: v.t + v.a, wins: v.w, losses: v.l };
  });
  return sortMonthly(list, r.tiebreak).map((e, i) => ({ ...e, position: i + 1 }));
}

/** Monthly total of one player (tournaments + adjustments), for adjustment checks. */
export async function playerMonthlyTotal(league: MonthlyLeague, month: string, userId: string, db: Db = prisma): Promise<{ tournamentPoints: number; adjustmentPoints: number; total: number }> {
  const [res, period] = await Promise.all([
    db.tournamentParticipant.aggregate({
      where: { userId, tournament: { ...monthTournamentWhere(league, month), status: "FINISHED" } },
      _sum: { rankingPoints: true },
    }),
    db.rankingPeriod.findUnique({ where: { communitySlug_month: { communitySlug: league, month } }, select: { id: true } }),
  ]);
  const adj = period ? await db.rankingOperation.aggregate({ where: { periodId: period.id, userId }, _sum: { points: true } }) : null;
  const t = res._sum.rankingPoints ?? 0;
  const a = adj?._sum.points ?? 0;
  return { tournamentPoints: t, adjustmentPoints: a, total: t + a };
}

/** Uncached (admin screens, closing checks). */
export async function computeMonthlyRanking(league: MonthlyLeague, month: string): Promise<MonthlyRanking> {
  const period = await prisma.rankingPeriod.findUnique({
    where: { communitySlug_month: { communitySlug: league, month } },
    select: { closedAt: true, standings: true, championUserId: true, pointsTable: true, tiebreak: true },
  });
  if (period?.closedAt) {
    const archived = (period.standings as unknown as { rules: MonthlyRules & { fromMonth: string | null }; rows: ArchivedRow[] } | null) ?? null;
    const rows = archived?.rows ?? [];
    const champ = rows.find((r) => r.id === period.championUserId) ?? rows[0] ?? null;
    return {
      league, month, status: "closed",
      rules: archived?.rules ?? { ...DEFAULT_RULES, fromMonth: null },
      entries: rows,
      champion: champ ? { id: champ.id, name: champ.name, avatarUrl: champ.avatarUrl, points: champ.points } : null,
      closedAt: period.closedAt.toISOString(),
    };
  }
  const rules = await effectiveRules(league, month);
  const entries = await computeLiveMonthly(league, month, prisma, rules);
  return { league, month, status: "open", rules, entries, champion: null, closedAt: null };
}

const outsideNext = (e: unknown) => /incrementalCache|static generation store/i.test(String(e));
/** THE monthly ranking (home, /rankings, admin). Public data: cached 60 s,
 *  invalidated by revalidateRankings() after finalizations, adjustments,
 *  rule changes and closings. */
export function getMonthlyRanking(league: MonthlyLeague, month: string = currentMonth()): Promise<MonthlyRanking> {
  const run = () => computeMonthlyRanking(league, month);
  try {
    return unstable_cache(run, ["monthly-ranking-v1", league, month], { revalidate: 60, tags: ["ranking"] })()
      .catch((e) => { if (outsideNext(e)) return run(); throw e; });
  } catch (e) {
    if (outsideNext(e)) return run();
    throw e;
  }
}

/** Months to offer in selectors: the last 12 up to the current one, plus every
 *  month of this league that has a record (closed months, adjustments). */
export async function monthOptions(league: MonthlyLeague, now: string = currentMonth()): Promise<string[]> {
  const set = new Set<string>();
  for (let i = 0; i < 12; i++) set.add(addMonths(now, -i));
  try {
    const periods = await prisma.rankingPeriod.findMany({ where: { communitySlug: league, month: { lte: now } }, select: { month: true } });
    for (const p of periods) set.add(p.month);
  } catch { /* table not migrated yet: offer the default range */ }
  return [...set].sort().reverse();
}

/** Closed months of a league, newest first, with their champions. */
export async function closedMonths(league: MonthlyLeague): Promise<{ month: string; championName: string | null; points: number | null }[]> {
  try {
    const rows = await prisma.rankingPeriod.findMany({ where: { communitySlug: league, closedAt: { not: null } }, orderBy: { month: "desc" }, select: { month: true, standings: true, championUserId: true } });
    return rows.map((r) => {
      const list = ((r.standings as unknown as { rows?: ArchivedRow[] } | null)?.rows ?? []);
      const c = list.find((x) => x.id === r.championUserId) ?? list[0];
      return { month: r.month, championName: c?.name ?? null, points: c?.points ?? null };
    });
  } catch {
    return [];
  }
}

export type { Tiebreak };

/** Error message when an event would score in a month already closed (create/edit). */
export async function closedMonthError(t: Parameters<typeof monthlyScopeOf>[0]): Promise<string | null> {
  const scope = monthlyScopeOf(t);
  if (!scope) return null;
  try {
    if (!(await isMonthClosed(scope.league, scope.month))) return null;
  } catch {
    return null; // table not migrated yet: nothing can be closed
  }
  return `O ranking mensal da ${scope.league.toUpperCase()} de ${scope.month} já foi encerrado. Escolha uma data em um mês aberto.`;
}
