// Single-day Suíço with its own knockout rules (disposable DB):
// Swiss Bo1 to 4, knockout Bo3 to 5 — every knockout round, the final and the
// 3rd-place match use the knockout rules; old events keep working.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import { generateSwissRound, advanceSwissTournament, recalculateStandings, getSwissRounds } from "../../src/lib/tournament-engine";
import { parseMatchRules } from "../../src/lib/matchRules";

after(async () => { await prisma.$disconnect(); });
let seq = 0;
async function mkTournament(rules: Record<string, unknown>) {
  const tag = `ko${Date.now()}${seq++}`;
  const org = await prisma.user.create({ data: { name: `org ${tag}`, email: `org-${tag}@it.test`, password: "x" } });
  const t = await prisma.tournament.create({
    data: { name: `T ${tag}`, format: "ROUND_ROBIN", status: "IN_PROGRESS", organizerId: org.id, qualifiers: 4, ...rules },
  });
  for (let i = 0; i < 8; i++) {
    const u = await prisma.user.create({ data: { name: `P${i} ${tag}`, bladerName: `P${i}`, email: `p${i}-${tag}@it.test`, password: "x" } });
    await prisma.tournamentParticipant.create({ data: { tournamentId: t.id, userId: u.id } });
  }
  return t;
}
async function playRound(tid: string, round: number) {
  const ms = await prisma.match.findMany({ where: { tournamentId: tid, round, status: { not: "FINISHED" } } });
  for (const m of ms) {
    await prisma.match.update({ where: { id: m.id }, data: { status: "FINISHED", winnerId: m.player1Id } });
    await recalculateStandings(tid, m.player1Id);
    await recalculateStandings(tid, m.player2Id);
  }
  await advanceSwissTournament(tid, round);
}
/** Plays the whole event; returns the rules each match actually uses
 *  (match value, else the tournament's main rules — as the scoring routes do). */
async function playAll(tid: string) {
  await generateSwissRound(tid, 1);
  const swissRounds = await getSwissRounds(tid);
  for (let r = 1; r <= swissRounds + 2; r++) await playRound(tid, r);
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id: tid } });
  const ms = await prisma.match.findMany({ where: { tournamentId: tid }, orderBy: [{ round: "asc" }, { bracketPos: "asc" }] });
  const eff = (m: (typeof ms)[number]) => `${m.setsToWin ?? t.setsToWin}/${m.pointsToWinSet ?? t.pointsToWinSet}`;
  return {
    t,
    swiss: ms.filter((m) => m.round <= swissRounds).map(eff),
    knockout: ms.filter((m) => m.round > swissRounds).map((m) => ({ round: m.round - swissRounds, third: m.isThirdPlace, rules: eff(m) })),
  };
}

test("one-day event: Swiss Bo1 to 4, knockout (semis, final, 3rd place) Bo3 to 5", async () => {
  const rules = parseMatchRules({ format: "ROUND_ROBIN", setsToWin: "1", pointsToWinSet: "4", day2SetsToWin: "2", day2PointsToWinSet: "5" });
  assert.ok(rules.ok);
  const t = await mkTournament({
    setsToWin: rules.setsToWin, pointsToWinSet: rules.pointsToWinSet, day2SetsToWin: rules.knockoutSets, day2PointsToWinSet: rules.knockoutPoints,
    isMultiDay: false, day2Date: null,
  });
  const r = await playAll(t.id);
  assert.ok(r.swiss.length > 0 && r.swiss.every((x) => x === "1/4"), JSON.stringify(r.swiss));
  assert.deepEqual(r.knockout, [
    { round: 1, third: false, rules: "2/5" }, { round: 1, third: false, rules: "2/5" },
    { round: 2, third: false, rules: "2/5" }, { round: 2, third: true, rules: "2/5" },
  ]);
  assert.equal(r.t.status, "FINISHED");
  assert.equal(r.t.isMultiDay, false);
  assert.equal(r.t.day2Date, null);
});

test("old single-day event without knockout rules: knockout falls back to the main rules", async () => {
  const t = await mkTournament({ setsToWin: 2, pointsToWinSet: 6, isMultiDay: false, day2SetsToWin: null, day2PointsToWinSet: null });
  const r = await playAll(t.id);
  assert.ok(r.swiss.every((x) => x === "2/6"));
  assert.ok(r.knockout.length === 4 && r.knockout.every((k) => k.rules === "2/6"), JSON.stringify(r.knockout));
});

test("old 2-day event keeps its date and its knockout rules", async () => {
  const day2 = new Date(Date.UTC(2030, 5, 2));
  const t = await mkTournament({ setsToWin: 1, pointsToWinSet: 4, isMultiDay: true, day2Date: day2, day2SetsToWin: 2, day2PointsToWinSet: 6 });
  const r = await playAll(t.id);
  assert.ok(r.swiss.every((x) => x === "1/4"));
  assert.ok(r.knockout.every((k) => k.rules === "2/6"), JSON.stringify(r.knockout));
  assert.equal(r.t.isMultiDay, true);
  assert.equal(r.t.day2Date?.toISOString(), day2.toISOString());
});
