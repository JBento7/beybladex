// Integration tests against a DISPOSABLE Postgres database (never production).
// Run: npm run test:integration  (needs TEST_DATABASE_URL; the script refuses
// to run when it points at the same database as DATABASE_URL in .env).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import {
  generateSwissRound, advanceSwissTournament, recalculateStandings, insertRoundMatches,
  auditTournament, repairSwissRound, getSwissRounds,
} from "../../src/lib/tournament-engine";
import { recordPoint, recordWalkover } from "../../src/lib/match-scoring";
import { hasBlocking } from "../../src/lib/swiss";
import { computeSwissStandings } from "../../src/lib/standings";

let seq = 0;
async function mkTournament(n: number, opts: { qualifiers?: number | null; format?: "ROUND_ROBIN" | "SWISS" } = {}) {
  const tag = `it${Date.now()}${seq++}`;
  const org = await prisma.user.create({ data: { name: `org ${tag}`, email: `org-${tag}@it.test`, password: "x" } });
  const t = await prisma.tournament.create({
    data: { name: `T ${tag}`, format: opts.format ?? "ROUND_ROBIN", status: "IN_PROGRESS", organizerId: org.id, qualifiers: opts.qualifiers ?? null, setsToWin: 1, pointsToWinSet: 4 },
  });
  const users = [];
  for (let i = 0; i < n; i++) {
    const u = await prisma.user.create({ data: { name: `P${String(i).padStart(2, "0")} ${tag}`, bladerName: `P${String(i).padStart(2, "0")}`, email: `p${i}-${tag}@it.test`, password: "x" } });
    users.push(u);
    await prisma.tournamentParticipant.create({ data: { tournamentId: t.id, userId: u.id } });
  }
  return { t, users };
}

/** Finish every open real match of a round (player1 wins), then advance. */
async function playRound(tid: string, round: number, winner: (m: { player1Id: string; player2Id: string }) => string = (m) => m.player1Id) {
  const ms = await prisma.match.findMany({ where: { tournamentId: tid, round, status: { not: "FINISHED" } } });
  for (const m of ms) {
    await prisma.match.update({ where: { id: m.id }, data: { status: "FINISHED", winnerId: winner(m) } });
    await recalculateStandings(tid, m.player1Id);
    await recalculateStandings(tid, m.player2Id);
  }
  await advanceSwissTournament(tid, round);
}
const swissPlayed = async (tid: string) => {
  const rounds = await getSwissRounds(tid);
  for (let r = 1; r <= rounds; r++) await playRound(tid, r);
  return rounds;
};

before(async () => { await prisma.$connect(); });
after(async () => { await prisma.$disconnect(); });

// ── Integrity / concurrency ──
test("two concurrent generations of the same round create it once", async () => {
  const { t } = await mkTournament(7);
  const [a, b] = await Promise.all([generateSwissRound(t.id, 1), generateSwissRound(t.id, 1)]);
  assert.deepEqual([a.status, b.status].sort(), ["created", "exists"]);
  assert.equal(await prisma.match.count({ where: { tournamentId: t.id, round: 1 } }), 4); // 3 matches + 1 bye
  assert.equal(await prisma.roundParticipation.count({ where: { tournamentId: t.id, round: 1 } }), 7);
  assert.equal(await prisma.swissRoundLog.count({ where: { tournamentId: t.id } }), 1);
});

test("unique participation: same player on two sides, or bye + match, is rejected atomically", async () => {
  const { t, users } = await mkTournament(4);
  const [A, B, C, D] = users.map((u) => u.id);
  await insertRoundMatches(t.id, "SWISS", 1, [{ tournamentId: t.id, player1Id: A, player2Id: B, round: 1 }]);
  // Two concurrent requests each trying to give C a match with A again.
  const results = await Promise.allSettled([
    insertRoundMatches(t.id, "SWISS", 1, [{ tournamentId: t.id, player1Id: C, player2Id: A, round: 1 }]),
    insertRoundMatches(t.id, "SWISS", 1, [{ tournamentId: t.id, player1Id: A, player2Id: A, round: 1, winnerId: A, status: "FINISHED", isWalkover: true }]),
  ]);
  assert.ok(results.every((r) => r.status === "rejected"));
  assert.equal(await prisma.match.count({ where: { tournamentId: t.id, round: 1 } }), 1); // nothing partial stored
  // Concurrent C×D vs D×A: exactly one wins.
  const race = await Promise.allSettled([
    insertRoundMatches(t.id, "SWISS", 1, [{ tournamentId: t.id, player1Id: C, player2Id: D, round: 1 }]),
    insertRoundMatches(t.id, "SWISS", 1, [{ tournamentId: t.id, player1Id: D, player2Id: B, round: 1 }]),
  ]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
});

test("historical conflicting records block advancing and are reported, not rewritten", async () => {
  const { t, users } = await mkTournament(4);
  await generateSwissRound(t.id, 1);
  const r1 = await prisma.match.findMany({ where: { tournamentId: t.id, round: 1 } });
  // Legacy-style extra match written without participation rows (like the old balancing).
  const extra = await prisma.match.create({ data: { tournamentId: t.id, round: 1, player1Id: r1[0].player1Id, player2Id: r1[1].player1Id, bracketPos: 1000 } });
  const issues = await auditTournament(t.id);
  assert.ok(hasBlocking(issues));
  await playRound(t.id, 1);
  assert.equal(await prisma.match.count({ where: { tournamentId: t.id, round: 2 } }), 0); // blocked
  assert.ok(await prisma.match.findUnique({ where: { id: extra.id } })); // preserved
  assert.equal((await prisma.tournament.findUnique({ where: { id: t.id } }))!.status, "IN_PROGRESS");
  void users;
});

test("an unfinished round never advances", async () => {
  const { t } = await mkTournament(4);
  await generateSwissRound(t.id, 1);
  await advanceSwissTournament(t.id, 1);
  assert.equal(await prisma.match.count({ where: { tournamentId: t.id, round: 2 } }), 0);
});

// ── Byes ──
test("9 players: one bye per round, never repeated while avoidable, no battle points", async () => {
  const { t } = await mkTournament(9, { qualifiers: 4 });
  await generateSwissRound(t.id, 1);
  const rounds = await swissPlayed(t.id);
  assert.equal(rounds, 4);
  const byes = await prisma.match.findMany({ where: { tournamentId: t.id, round: { lte: 4 }, isWalkover: true } });
  assert.equal(byes.length, 4);
  assert.equal(new Set(byes.map((b) => b.player1Id)).size, 4);
  assert.ok(byes.every((b) => b.player1Id === b.player2Id && b.arena == null && b.judgeId == null));
  const parts = await prisma.roundParticipation.findMany({ where: { tournamentId: t.id, phase: "SWISS" } });
  assert.equal(parts.length, 9 * 4); // exactly one participation per player per round
  // Knockout top 4 generated from the same standings.
  assert.equal(await prisma.match.count({ where: { tournamentId: t.id, round: 5 } }), 2);
});

// ── Knockout ──
async function koFirstRound(tid: string, swissRounds: number) {
  const ms = await prisma.match.findMany({ where: { tournamentId: tid, round: swissRounds + 1 }, orderBy: { bracketPos: "asc" } });
  return ms;
}
async function seededIds(tid: string, swissRounds: number) {
  const [ps, ms] = await Promise.all([
    prisma.tournamentParticipant.findMany({ where: { tournamentId: tid }, include: { user: true } }),
    prisma.match.findMany({ where: { tournamentId: tid }, include: { points: true } }),
  ]);
  return computeSwissStandings(ps.map((p) => p.userId), ms, swissRounds, new Map(ps.map((p) => [p.userId, p.user.bladerName || p.user.name]))).map((r) => r.userId);
}

test("4 players with top 4: semifinals are generated (not an early finish), 1×4 and 2×3", async () => {
  const { t } = await mkTournament(4, { qualifiers: 4 });
  await generateSwissRound(t.id, 1);
  const sr = await swissPlayed(t.id);
  const ko = await koFirstRound(t.id, sr);
  assert.equal(ko.length, 2);
  const s = await seededIds(t.id, sr);
  assert.deepEqual(ko.map((m) => [m.player1Id, m.player2Id]), [[s[0], s[3]], [s[1], s[2]]]);
  assert.equal((await prisma.tournament.findUnique({ where: { id: t.id } }))!.status, "IN_PROGRESS");
});

test("8 players with top 8: 1×8, 4×5, 2×7, 3×6 and the bracket advances by position", async () => {
  const { t } = await mkTournament(8, { qualifiers: 8 });
  await generateSwissRound(t.id, 1);
  const sr = await swissPlayed(t.id);
  const ko = await koFirstRound(t.id, sr);
  const s = await seededIds(t.id, sr);
  assert.deepEqual(ko.map((m) => [m.player1Id, m.player2Id]), [[s[0], s[7]], [s[3], s[4]], [s[1], s[6]], [s[2], s[5]]]);
  // Finish quarterfinals in reverse order; semis must pair positions (1,2) and (3,4).
  for (const m of [...ko].reverse()) {
    await prisma.match.update({ where: { id: m.id }, data: { status: "FINISHED", winnerId: m.player2Id } });
    await advanceSwissTournament(t.id, sr + 1);
  }
  const semis = await prisma.match.findMany({ where: { tournamentId: t.id, round: sr + 2 }, orderBy: { bracketPos: "asc" } });
  assert.deepEqual(semis.map((m) => [m.player1Id, m.player2Id]), [[ko[0].player2Id, ko[1].player2Id], [ko[2].player2Id, ko[3].player2Id]]);
});

test("9 players with top 8: quarterfinals from the top 8", async () => {
  const { t } = await mkTournament(9, { qualifiers: 8 });
  await generateSwissRound(t.id, 1);
  const sr = await swissPlayed(t.id);
  assert.equal((await koFirstRound(t.id, sr)).length, 4);
});

test("cut larger than the field: no knockout, no silent finish", async () => {
  const { t } = await mkTournament(6, { qualifiers: 8 });
  await generateSwissRound(t.id, 1);
  const sr = await swissPlayed(t.id);
  assert.equal(await prisma.match.count({ where: { tournamentId: t.id, round: { gt: sr } } }), 0);
  assert.equal((await prisma.tournament.findUnique({ where: { id: t.id } }))!.status, "IN_PROGRESS");
});

test("the legacy SWISS format uses the same engine (rounds + knockout)", async () => {
  const { t } = await mkTournament(4, { qualifiers: 4, format: "SWISS" });
  await generateSwissRound(t.id, 1);
  const sr = await swissPlayed(t.id);
  assert.equal((await koFirstRound(t.id, sr)).length, 2);
});

// ── Repair ──
test("repair: A missing while B and C played → no second participation for B; re-running is a no-op", async () => {
  const { t, users } = await mkTournament(5);
  const [A, B, C, D, E] = users.map((u) => u.id);
  await prisma.tournament.update({ where: { id: t.id }, data: { swissRounds: 3 } });
  await insertRoundMatches(t.id, "SWISS", 1, [
    { tournamentId: t.id, player1Id: B, player2Id: C, round: 1 },
  ]);
  const sim = await repairSwissRound(t.id, 1);
  assert.ok(sim.ok && !sim.applied);
  if (!sim.ok) return;
  assert.deepEqual([...sim.plan.missing].sort(), [A, D, E].sort());
  assert.ok(sim.plan.proposals.every((p) => ![p.player1Id, p.player2Id].includes(B) && ![p.player1Id, p.player2Id].includes(C)));
  assert.equal(await prisma.match.count({ where: { tournamentId: t.id } }), 1); // simulation wrote nothing
  const applied = await repairSwissRound(t.id, 1, { apply: true, reason: "teste" });
  assert.ok(applied.ok && applied.applied);
  const again = await repairSwissRound(t.id, 1, { apply: true, reason: "teste" });
  assert.ok(again.ok && !again.applied);
  const parts = await prisma.roundParticipation.groupBy({ by: ["userId"], where: { tournamentId: t.id, round: 1 }, _count: true });
  assert.ok(parts.every((p) => p._count === 1));
  assert.equal(await prisma.tournamentAdminAction.count({ where: { tournamentId: t.id, kind: "SWISS_ROUND_REPAIR" } }), 1);
});

test("repair never deletes a finished knockout", async () => {
  const { t } = await mkTournament(4, { qualifiers: 4 });
  await generateSwissRound(t.id, 1);
  const sr = await swissPlayed(t.id);
  const before = await prisma.match.count({ where: { tournamentId: t.id, round: { gt: sr } } });
  const res = await repairSwissRound(t.id, 1, { apply: true, reason: "teste" });
  assert.ok(res.ok); // nothing missing → no-op, and certainly no teardown
  assert.equal(await prisma.match.count({ where: { tournamentId: t.id, round: { gt: sr } } }), before);
});

// ── Scoring ──
async function scoringMatch() {
  const { t, users } = await mkTournament(2);
  const m = await prisma.match.create({ data: { tournamentId: t.id, round: 1, player1Id: users[0].id, player2Id: users[1].id } });
  return { m, a: users[0].id, b: users[1].id };
}
const P = (scorerId: string, points: number, actionId?: string) => ({ scorerId, finishType: "SPIN_FINISH" as const, points, actionId, setsToWin: 1, pointsToWinSet: 4 });

test("resending the same action is idempotent", async () => {
  const { m, a } = await scoringMatch();
  const [x, y] = await Promise.all([recordPoint(m.id, P(a, 1, "act-1")), recordPoint(m.id, P(a, 1, "act-1"))]);
  assert.deepEqual([x.kind, y.kind].sort(), ["ok", "replay"]);
  assert.equal(await prisma.matchPoint.count({ where: { matchId: m.id } }), 1);
});

test("two devices scoring the match point at once: one winner, one closer", async () => {
  const { m, a, b } = await scoringMatch();
  await recordPoint(m.id, P(a, 3));
  await recordPoint(m.id, P(b, 3));
  const res = await Promise.all([recordPoint(m.id, P(a, 1)), recordPoint(m.id, P(b, 1))]);
  const closers = res.filter((r) => r.kind === "ok" && r.finishedNow);
  assert.equal(closers.length, 1);
  const final = await prisma.match.findUnique({ where: { id: m.id }, include: { sets: true } });
  assert.equal(final!.status, "FINISHED");
  assert.equal(final!.sets.filter((s) => s.status === "FINISHED").length, 1);
  assert.equal(await prisma.matchPoint.count({ where: { matchId: m.id } }), 3); // the loser of the race was refused
});

test("a finish that overshoots the target is stored in full", async () => {
  const { m, a } = await scoringMatch();
  await recordPoint(m.id, P(a, 3));
  const r = await recordPoint(m.id, { ...P(a, 3), finishType: "EXTREME_FINISH" });
  assert.ok(r.kind === "ok" && r.finishedNow);
  const set = await prisma.matchSet.findFirst({ where: { matchId: m.id } });
  assert.equal(set!.player1Points, 6);
});

test("W.O. racing the final point: exactly one closes the match", async () => {
  const { m, a, b } = await scoringMatch();
  await recordPoint(m.id, P(a, 3));
  const [wo, pt] = await Promise.all([recordWalkover(m.id, b), recordPoint(m.id, P(a, 1))]);
  const closedByPoint = pt.kind === "ok" && pt.finishedNow;
  assert.equal(Number(wo) + Number(closedByPoint), 1);
  const final = await prisma.match.findUnique({ where: { id: m.id } });
  assert.equal(final!.winnerId, wo ? b : a);
  assert.equal(final!.isWalkover, wo);
});
