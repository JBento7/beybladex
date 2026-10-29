// Monthly rankings (disposable DB, docs/RANKING-MENSAL.md): LBL/LBM separated
// by month, adjustments apart from tournament results, idempotency, frozen
// tables, closing and immutability, league-scoped admins.
// Uses months of 2025 so other test files (current-month data) don't interfere.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import { computeMonthlyRanking, effectiveRules, getMonthlyRanking } from "../../src/lib/monthlyRanking";
import { applyAdjustment, checkTarget, closeMonth, setRules, MonthlyError } from "../../src/lib/monthlyAdmin";
import { generateSwissRound, advanceSwissTournament, recalculateStandings, getSwissRounds, finalizeTournamentRanking, monthClosedFor } from "../../src/lib/tournament-engine";
import { getHomeData } from "../../src/lib/homeData";
import { currentMonth } from "../../src/lib/monthlyRules";

after(async () => { await prisma.$disconnect(); });
const tag = `mr${Date.now()}`;
let n = 0;
const rid = () => `${tag}-req-${n++}`;
const mkUser = (label: string) =>
  prisma.user.create({ data: { name: `${label} ${tag}`, bladerName: `${label}${tag}`, email: `${label}-${tag}-${n++}@it.test`, password: "x" } });
let admin: { id: string };
const adminId = async () => (admin ??= await mkUser("admin")).id;

/** A finished event with given results (rankingPoints/wins written directly). */
async function finished(league: string, startDate: Date | null, rows: { userId: string; points: number; wins?: number }[], extra: Record<string, unknown> = {}) {
  const org = await mkUser("org");
  const t = await prisma.tournament.create({
    data: { name: `${tag} ev${n++}`, format: "ROUND_ROBIN", status: "FINISHED", organizerId: org.id, communitySlug: league, isOfficial: true, startDate, ...extra },
  });
  for (const [i, r] of rows.entries()) {
    await prisma.tournamentParticipant.create({ data: { tournamentId: t.id, userId: r.userId, placement: i + 1, rankingPoints: r.points, wins: r.wins ?? 0 } });
  }
  return t;
}
const d = (iso: string) => new Date(iso);
const totals = async (league: "lbl" | "lbm", month: string) =>
  Object.fromEntries((await computeMonthlyRanking(league, month)).entries.map((e) => [e.id, e.points]));
const rejects = async (p: Promise<unknown>, status: number, re?: RegExp) => {
  await assert.rejects(p, (e: unknown) => e instanceof MonthlyError && e.status === status && (!re || re.test(e.message)));
};

test("LBL and LBM are separate; other months, tests, casual and partnership events don't count", async () => {
  const [a, b, c] = [await mkUser("A"), await mkUser("B"), await mkUser("C")];
  await finished("lbl", d("2025-03-10T15:00:00Z"), [{ userId: a.id, points: 100 }, { userId: b.id, points: 70 }]);
  await finished("lbm", d("2025-03-12T15:00:00Z"), [{ userId: c.id, points: 100 }]);
  await finished("lbl", d("2025-04-01T10:00:00Z"), [{ userId: b.id, points: 100 }]); // other month
  await finished("lbl", d("2025-03-20T10:00:00Z"), [{ userId: b.id, points: 999 }], { isTest: true });
  await finished("lbl", d("2025-03-20T10:00:00Z"), [{ userId: b.id, points: 999 }], { isOfficial: false });
  await finished("lbl", d("2025-03-20T10:00:00Z"), [{ userId: b.id, points: 999 }], { isPartnership: true });
  // No date: created at 23:30 of 31/03 in Brasília (02:30 UTC on 01/04) → March.
  await finished("lbl", null, [{ userId: c.id, points: 10 }], { createdAt: d("2025-04-01T02:30:00Z") });

  assert.deepEqual(await totals("lbl", "2025-03"), { [a.id]: 100, [b.id]: 70, [c.id]: 10 });
  assert.deepEqual(await totals("lbm", "2025-03"), { [c.id]: 100 });
  assert.deepEqual(await totals("lbl", "2025-04"), { [b.id]: 100 });
  assert.deepEqual(await totals("lbl", "2025-02"), {}); // new month starts empty

  // An adjustment in LBL doesn't reach LBM.
  await applyAdjustment({ league: "lbl", month: "2025-03", requestId: rid(), kind: "ADD", userId: c.id, points: 5, reason: "teste de separação", actorId: await adminId() });
  assert.equal((await totals("lbl", "2025-03"))[c.id], 15);
  assert.deepEqual(await totals("lbm", "2025-03"), { [c.id]: 100 });
});

test("add / remove / reset player / reset month: adjustments only, results untouched, never negative", async () => {
  const [a, b] = [await mkUser("A"), await mkUser("B")];
  const ev = await finished("lbl", d("2025-05-10T15:00:00Z"), [{ userId: a.id, points: 100 }, { userId: b.id, points: 70 }]);
  const base = { league: "lbl" as const, month: "2025-05", actorId: await adminId() };

  await applyAdjustment({ ...base, requestId: rid(), kind: "ADD", userId: a.id, points: 20, reason: "bônus de organização" });
  let r = await computeMonthlyRanking("lbl", "2025-05");
  const rowA = r.entries.find((e) => e.id === a.id)!;
  assert.deepEqual([rowA.tournamentPoints, rowA.adjustmentPoints, rowA.points], [100, 20, 120]);

  await rejects(applyAdjustment({ ...base, requestId: rid(), kind: "REMOVE", userId: a.id, points: 121, reason: "teste" }), 400, /Saldo insuficiente/);
  await rejects(applyAdjustment({ ...base, requestId: rid(), kind: "ADD", userId: a.id, points: 5, reason: " " }), 400, /motivo/);
  await rejects(applyAdjustment({ ...base, requestId: rid(), kind: "ADD", userId: a.id, points: 0, reason: "teste" }), 400);

  const reset = await applyAdjustment({ ...base, requestId: rid(), kind: "RESET_PLAYER", userId: a.id, reason: "zerar jogador" });
  assert.deepEqual(reset.changes, [{ userId: a.id, before: 120, delta: -120, after: 0 }]);
  r = await computeMonthlyRanking("lbl", "2025-05");
  assert.equal(r.entries.find((e) => e.id === a.id), undefined); // 0 points → not listed
  // The tournament result itself is unchanged.
  const stored = await prisma.tournamentParticipant.findFirst({ where: { tournamentId: ev.id, userId: a.id } });
  assert.equal(stored!.rankingPoints, 100);
  await rejects(applyAdjustment({ ...base, requestId: rid(), kind: "RESET_PLAYER", userId: a.id, reason: "de novo" }), 400, /zero/);

  const month = await applyAdjustment({ ...base, requestId: rid(), kind: "RESET_MONTH", reason: "zerar mês" });
  assert.equal(month.changes.length, 1);
  assert.deepEqual(await totals("lbl", "2025-05"), {});
  assert.equal(await prisma.tournamentParticipant.count({ where: { tournamentId: ev.id, rankingPoints: { gt: 0 } } }), 2);
});

test("repeated or concurrent requests never duplicate an adjustment", async () => {
  const a = await mkUser("A");
  await finished("lbm", d("2025-06-05T15:00:00Z"), [{ userId: a.id, points: 50 }]);
  const base = { league: "lbm" as const, month: "2025-06", actorId: await adminId(), kind: "ADD", userId: a.id, points: 10, reason: "clique duplo" };
  const id = rid();
  const first = await applyAdjustment({ ...base, requestId: id });
  const again = await applyAdjustment({ ...base, requestId: id });
  assert.equal(first.replayed, false);
  assert.equal(again.replayed, true);
  // Same request sent twice at the same time.
  const id2 = rid();
  const both = await Promise.allSettled([applyAdjustment({ ...base, requestId: id2 }), applyAdjustment({ ...base, requestId: id2 })]);
  assert.ok(both.some((x) => x.status === "fulfilled" && !x.value.replayed));
  // Two different requests at the same time: both apply (serialized by the month lock).
  await Promise.all([applyAdjustment({ ...base, requestId: rid() }), applyAdjustment({ ...base, requestId: rid() })]);
  assert.equal((await totals("lbm", "2025-06"))[a.id], 50 + 10 + 10 + 20);
  assert.equal(await prisma.rankingOperation.count({ where: { requestId: id } }), 1);
});

/** Plays a real 8-player pure Swiss event in a given month → engine finalization. */
async function playedEvent(league: "lbl" | "lbm", startDate: Date, extra: Record<string, unknown> = {}) {
  const org = await mkUser("org");
  const t = await prisma.tournament.create({
    data: { name: `${tag} play${n++}`, format: "ROUND_ROBIN", status: "IN_PROGRESS", organizerId: org.id, communitySlug: league, isOfficial: true, startDate, setsToWin: 1, pointsToWinSet: 4, ...extra },
  });
  for (let i = 0; i < 8; i++) {
    const u = await mkUser(`P${i}`);
    await prisma.tournamentParticipant.create({ data: { tournamentId: t.id, userId: u.id } });
  }
  await generateSwissRound(t.id, 1);
  const rounds = await getSwissRounds(t.id);
  for (let r = 1; r <= rounds; r++) {
    for (const m of await prisma.match.findMany({ where: { tournamentId: t.id, round: r, status: { not: "FINISHED" } } })) {
      await prisma.match.update({ where: { id: m.id }, data: { status: "FINISHED", winnerId: m.player1Id } });
      await recalculateStandings(t.id, m.player1Id);
      await recalculateStandings(t.id, m.player2Id);
    }
    await advanceSwissTournament(t.id, r);
  }
  return t.id;
}
const podium = async (tid: string) =>
  (await prisma.tournamentParticipant.findMany({ where: { tournamentId: tid }, orderBy: { placement: "asc" }, select: { rankingPoints: true } })).map((p) => p.rankingPoints).slice(0, 4);

test("rules: inherited by later months, frozen per event, doubled once; old results unchanged", async () => {
  const base = { league: "lbl" as const, actorId: await adminId() };
  await setRules({ ...base, month: "2025-07", requestId: rid(), pointsTable: [200, 100], tiebreak: "WINS", reason: "nova tabela" });
  assert.deepEqual((await effectiveRules("lbl", "2025-06")).pointsTable, [100, 70, 50, 30, 10]);
  assert.deepEqual((await effectiveRules("lbl", "2025-09")), { pointsTable: [200, 100], tiebreak: "WINS", fromMonth: "2025-07" });
  assert.deepEqual((await effectiveRules("lbm", "2025-09")).pointsTable, [100, 70, 50, 30, 10]); // other league untouched

  const ev = await playedEvent("lbl", d("2025-08-09T14:00:00Z"));
  assert.deepEqual(await podium(ev), [200, 100, 0, 0]);
  const dbl = await playedEvent("lbl", d("2025-08-16T14:00:00Z"), { doubleRankingPoints: true });
  assert.deepEqual(await podium(dbl), [400, 200, 0, 0]);

  // New rules later: already finalized events keep their frozen table, even when recalculated.
  await setRules({ ...base, month: "2025-08", requestId: rid(), pointsTable: [10], tiebreak: "NICKNAME", reason: "mudou de novo" });
  await finalizeTournamentRanking(ev);
  await finalizeTournamentRanking(dbl);
  assert.deepEqual(await podium(ev), [200, 100, 0, 0]);
  assert.deepEqual(await podium(dbl), [400, 200, 0, 0]);

  // An event finalized before tables were frozen keeps the default table.
  const legacy = await playedEvent("lbl", d("2025-08-20T14:00:00Z"));
  await prisma.tournament.update({ where: { id: legacy }, data: { rankingPointsTable: { set: null } as never } });
  await prisma.tournamentParticipant.updateMany({ where: { tournamentId: legacy, placement: 1 }, data: { rankingPoints: 100 } });
  await finalizeTournamentRanking(legacy);
  assert.equal((await podium(legacy))[0], 100, "default table it was finalized with — not the newer [10] rules");
});

test("closing: blockers, server-side leader check, archive, immutability, independent leagues", async () => {
  const actorId = await adminId();
  const [a, b] = [await mkUser("A"), await mkUser("B")];
  const month = "2025-10";
  await finished("lbm", d("2025-10-04T15:00:00Z"), [{ userId: a.id, points: 100, wins: 3 }, { userId: b.id, points: 70, wins: 2 }]);
  await finished("lbl", d("2025-10-04T15:00:00Z"), [{ userId: b.id, points: 100 }]);
  const open = await prisma.tournament.create({ data: { name: `${tag} aberto`, format: "ROUND_ROBIN", status: "REGISTRATION", organizerId: actorId, communitySlug: "lbm", isOfficial: true, startDate: d("2025-10-25T15:00:00Z") } });

  await rejects(closeMonth({ league: "lbm", month: "2099-01", requestId: rid(), expectedLeaderId: null, actorId }), 400, /futuro/);
  await rejects(closeMonth({ league: "lbm", month: "2025-01", requestId: rid(), expectedLeaderId: null, actorId }), 400, /Nenhum jogador/);
  await rejects(closeMonth({ league: "lbm", month, requestId: rid(), expectedLeaderId: a.id, actorId }), 409, /inscrições ou em andamento/);
  await prisma.tournament.update({ where: { id: open.id }, data: { status: "DRAFT" } });

  // Something changed after the admin saw the leader → nothing is closed.
  await applyAdjustment({ league: "lbm", month, requestId: rid(), kind: "ADD", userId: b.id, points: 40, reason: "ajuste antes do fechamento", actorId });
  await rejects(closeMonth({ league: "lbm", month, requestId: rid(), expectedLeaderId: a.id, actorId }), 409, /classificação mudou/);

  const closeId = rid();
  const done = await closeMonth({ league: "lbm", month, requestId: closeId, expectedLeaderId: b.id, actorId });
  assert.equal(done.champion.id, b.id);
  assert.equal(done.champion.points, 110);
  const again = await closeMonth({ league: "lbm", month, requestId: closeId, expectedLeaderId: b.id, actorId });
  assert.equal(again.replayed, true);
  const period = await prisma.rankingPeriod.findUniqueOrThrow({ where: { communitySlug_month: { communitySlug: "lbm", month } } });
  assert.equal(period.championUserId, b.id);
  assert.equal(period.closedById, actorId);
  assert.ok(period.closedAt);

  // Immutable: no adjustments, rules, finalizations or new events in that month.
  await rejects(applyAdjustment({ league: "lbm", month, requestId: rid(), kind: "ADD", userId: a.id, points: 1, reason: "depois de fechar", actorId }), 409);
  await rejects(setRules({ league: "lbm", month, requestId: rid(), pointsTable: [1], tiebreak: "NICKNAME", reason: "depois", actorId }), 409);
  await rejects(closeMonth({ league: "lbm", month, requestId: rid(), expectedLeaderId: null, actorId }), 409);
  const late = await prisma.tournament.create({ data: { name: `${tag} tardio`, format: "ROUND_ROBIN", status: "IN_PROGRESS", organizerId: actorId, communitySlug: "lbm", isOfficial: true, startDate: d("2025-10-30T15:00:00Z") } });
  await prisma.tournamentParticipant.create({ data: { tournamentId: late.id, userId: a.id } });
  assert.deepEqual(await finalizeTournamentRanking(late.id), { ok: false, reason: "month_closed", league: "lbm", month });
  assert.deepEqual(await monthClosedFor(late.id), { league: "lbm", month });

  // Archived classification survives profile changes and later data changes.
  await prisma.user.update({ where: { id: b.id }, data: { bladerName: "Outro nome" } });
  await prisma.tournamentParticipant.updateMany({ where: { userId: a.id, tournament: { communitySlug: "lbm" } }, data: { rankingPoints: 999 } });
  const archived = await computeMonthlyRanking("lbm", month);
  assert.equal(archived.status, "closed");
  assert.equal(archived.champion?.id, b.id);
  assert.equal(archived.entries[0].name, `B${tag}`);
  assert.deepEqual(archived.entries.map((e) => [e.position, e.points, e.wins]), [[1, 110, 2], [2, 100, 3]]);

  // LBL of the same month is still open.
  assert.equal((await computeMonthlyRanking("lbl", month)).status, "open");
});

test("permissions: organizers only, scoped admins only in their league", () => {
  const s = (role: string, adminCommunity: string | null) => ({ user: { id: "x", role, adminCommunity } }) as never;
  assert.deepEqual(checkTarget(s("ORGANIZER", null), "lbm", "2025-10"), { league: "lbm", month: "2025-10" });
  assert.deepEqual(checkTarget(s("ORGANIZER", "lbl"), "lbl", "2025-10"), { league: "lbl", month: "2025-10" });
  assert.throws(() => checkTarget(s("ORGANIZER", "lbl"), "lbm", "2025-10"), (e: unknown) => e instanceof MonthlyError && e.status === 403);
  assert.throws(() => checkTarget(s("PARTICIPANT", null), "lbl", "2025-10"), (e: unknown) => e instanceof MonthlyError && e.status === 403);
  assert.throws(() => checkTarget(null, "lbl", "2025-10"), (e: unknown) => e instanceof MonthlyError && e.status === 403);
  assert.throws(() => checkTarget(s("ORGANIZER", null), "xyz", "2025-10"), (e: unknown) => e instanceof MonthlyError && e.status === 400);
  assert.throws(() => checkTarget(s("ORGANIZER", null), "lbl", "2025-13"), (e: unknown) => e instanceof MonthlyError && e.status === 400);
});

test("home page and full ranking show the same current-month classification", async () => {
  for (const league of ["lbl", "lbm"] as const) {
    const home = await getHomeData(league);
    const full = await getMonthlyRanking(league, currentMonth());
    assert.equal(home.month, currentMonth());
    assert.deepEqual(home.ranking.map((r) => [r.id, r.points]), full.entries.map((r) => [r.id, r.points]));
  }
});
