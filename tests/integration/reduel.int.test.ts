// Reduel (disposable DB, docs/REDUEL.md): repeating a launch keeps points,
// sets, sides and deck order; it is idempotent; it races points safely; a
// point from an annulled attempt is refused; finished matches are blocked.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import { recordPoint } from "../../src/lib/match-scoring";
import { recordReduel } from "../../src/lib/matchReduel";
import { loadMatchState } from "../../src/lib/matchState";

after(async () => { await prisma.$disconnect(); });
const tag = `rd${Date.now()}`;
let n = 0;
const mkUser = () => prisma.user.create({ data: { name: `U${n}`, bladerName: `${tag}-${n}`, email: `${tag}-${n++}@it.test`, password: "x" } });
const mkBey = (userId: string, i: number) => prisma.beyblade.create({ data: { userId, name: `Bey ${i}`, beyLine: "BX", blade: `B${i}-${userId.slice(-5)}`, ratchet: `${i}-60`, bit: `Bit${i}` } });
const actor = { actorId: "op", actorRole: "organizer" };

async function setup(displayMode: "ARENA" | "JUDGE_ONLY", deckType: "SOLO" | "THREE_ON_THREE" = "THREE_ON_THREE") {
  const org = await mkUser();
  const t = await prisma.tournament.create({ data: { name: `${tag} ${displayMode}`, format: "SWISS", status: "IN_PROGRESS", organizerId: org.id, deckType, setsToWin: 2, pointsToWinSet: 4, communitySlug: "lbl", displayMode } });
  const player = async () => {
    const u = await mkUser();
    const beys = [];
    for (let i = 1; i <= (deckType === "SOLO" ? 1 : 3); i++) beys.push((await mkBey(u.id, i)).id);
    await prisma.tournamentParticipant.create({ data: { tournamentId: t.id, userId: u.id, approved: true, beyblade1: beys[0], beyblade2: beys[1] ?? null, beyblade3: beys[2] ?? null } });
    return { id: u.id, beys };
  };
  const a = await player(), b = await player();
  const m = await prisma.match.create({ data: { tournamentId: t.id, round: 1, player1Id: a.id, player2Id: b.id, arena: 1, xSidePlayerId: b.id } });
  if (displayMode === "ARENA" && deckType !== "SOLO") {
    for (const p of [a, b]) await prisma.matchDeckOrder.create({ data: { matchId: m.id, userId: p.id, setNumber: 1, cycleIndex: 0, bey1Id: p.beys[0], bey2Id: p.beys[1], bey3Id: p.beys[2] } });
  }
  return { t, a, b, m };
}
let act = 0;
const pt = (matchId: string, scorerId: string, setNumber: number, battle: number, attempt?: number, beybladeId: string | null = null) =>
  recordPoint(matchId, { scorerId, finishType: "SPIN_FINISH", points: 1, beybladeId, actionId: `${tag}-p${act++}`, setsToWin: 2, pointsToWinSet: 4, context: { setNumber, battle, attempt } }, actor);
const snapshot = async (id: string) => {
  const m = await prisma.match.findUnique({ where: { id }, include: { sets: true, points: true, deckOrders: true } });
  return { sets: m!.sets.map((s) => [s.setNumber, s.player1Points, s.player2Points, s.status]), points: m!.points.length, orders: m!.deckOrders.length, xSide: m!.xSidePlayerId, winner: m!.winnerId, status: m!.status };
};

test("Reduel keeps points, sets, sides and order; new attempt; idempotent; telão signal", async () => {
  const x = await setup("ARENA");
  assert.equal((await pt(x.m.id, x.a.id, 1, 0, 0, x.a.beys[0])).kind, "ok");
  assert.equal((await pt(x.m.id, x.b.id, 1, 1, 0, x.b.beys[1])).kind, "ok");
  await prisma.match.update({ where: { id: x.m.id }, data: { countdownAt: new Date(), countdownKey: "cd-1" } });
  const before = await snapshot(x.m.id);
  const v0 = (await prisma.match.findUnique({ where: { id: x.m.id } }))!.scoreVersion;
  const r = await recordReduel(x.m.id, { opId: `${tag}-op-1`, setNumber: 1, battle: 2, attempt: 0 }, actor);
  assert.ok(r.kind === "ok" && r.attempt === 1 && r.reduelsNow === 1);
  assert.deepEqual(await snapshot(x.m.id), before, "score, sets, sides, deck order untouched");
  const m = (await prisma.match.findUnique({ where: { id: x.m.id } }))!;
  assert.equal(m.scoreVersion, v0 + 1, "panels reload");
  assert.equal(m.countdownAt, null, "pending countdown of the annulled attempt withdrawn");
  assert.ok(m.reduelAt && m.reduelKey === `${tag}-op-1`);
  assert.equal(await prisma.matchAuditLog.count({ where: { matchId: x.m.id, op: "reduel" } }), 1, "history");
  // Same request again (double tap / resend): acknowledged, nothing new.
  const again = await recordReduel(x.m.id, { opId: `${tag}-op-1`, setNumber: 1, battle: 2, attempt: 0 }, actor);
  assert.equal(again.kind, "replay");
  assert.equal(await prisma.matchReduel.count({ where: { matchId: x.m.id } }), 1);
  // State: same battle, attempt 2.
  const st = await loadMatchState(x.m.id, null);
  assert.equal(st!.currentSetBattleCount, 2);
  assert.equal(st!.reduel.count, 1);
  // A point tapped in the annulled attempt is refused; the new attempt scores
  // the SAME battle (same position in the order: 3rd Beyblade).
  const old = await pt(x.m.id, x.a.id, 1, 2, 0, x.a.beys[2]);
  assert.ok(old.kind === "error" && old.code === "REDUEL_VOIDED");
  assert.equal((await pt(x.m.id, x.a.id, 1, 2, 1, x.a.beys[2])).kind, "ok");
  assert.equal((await snapshot(x.m.id)).points, 3);
});

test("Reduel after the point was confirmed is refused; nothing removed", async () => {
  const x = await setup("JUDGE_ONLY", "SOLO");
  assert.equal((await pt(x.m.id, x.a.id, 1, 0, 0)).kind, "ok");
  const before = await snapshot(x.m.id);
  const r = await recordReduel(x.m.id, { opId: `${tag}-op-2`, setNumber: 1, battle: 0, attempt: 0 }, actor);
  assert.ok(r.kind === "error" && r.code === "BATTLE_SCORED");
  assert.deepEqual(await snapshot(x.m.id), before);
  // Judge-only: no telão signal.
  const ok = await recordReduel(x.m.id, { opId: `${tag}-op-3`, setNumber: 1, battle: 1, attempt: 0 }, actor);
  assert.equal(ok.kind, "ok");
  assert.equal((await prisma.match.findUnique({ where: { id: x.m.id } }))!.reduelAt, null);
});

test("Reduel racing a point: exactly one wins, never both", async () => {
  for (let i = 0; i < 6; i++) {
    const x = await setup("JUDGE_ONLY", "SOLO");
    const [rd, p] = await Promise.all([
      recordReduel(x.m.id, { opId: `${tag}-race-${i}`, setNumber: 1, battle: 0, attempt: 0 }, actor),
      pt(x.m.id, x.a.id, 1, 0, 0),
    ]);
    const reduelWon = rd.kind === "ok";
    const pointWon = p.kind === "ok";
    assert.ok(reduelWon !== pointWon, `one outcome (reduel=${rd.kind}, point=${p.kind})`);
    if (reduelWon) assert.ok(p.kind === "error" && p.code === "REDUEL_VOIDED");
    else assert.ok(rd.kind === "error" && rd.code === "BATTLE_SCORED");
  }
});

test("duplicate taps at once store one Reduel; two operators can't annul twice; finished match blocked", async () => {
  const x = await setup("JUDGE_ONLY", "SOLO");
  const outs = await Promise.all([1, 2, 3].map(() => recordReduel(x.m.id, { opId: `${tag}-dup`, setNumber: 1, battle: 0, attempt: 0 }, actor)));
  assert.equal(outs.filter((o) => o.kind === "ok").length, 1);
  assert.equal(await prisma.matchReduel.count({ where: { matchId: x.m.id } }), 1);
  const other = await recordReduel(x.m.id, { opId: `${tag}-other`, setNumber: 1, battle: 0, attempt: 0 }, actor);
  assert.ok(other.kind === "error" && other.code === "REDUEL_STALE");
  for (let i = 0; i < 4; i++) await pt(x.m.id, x.a.id, 1, i, i === 0 ? 1 : 0);
  for (let i = 0; i < 4; i++) await pt(x.m.id, x.a.id, 2, i, 0);
  assert.equal((await snapshot(x.m.id)).status, "FINISHED");
  const fin = await recordReduel(x.m.id, { opId: `${tag}-fin`, setNumber: 3, battle: 0, attempt: 0 }, actor);
  assert.ok(fin.kind === "error" && fin.code === "MATCH_FINISHED");
});
