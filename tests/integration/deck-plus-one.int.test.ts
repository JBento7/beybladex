// 3on3 + 1 reserva (disposable DB): registration of 4, per-match trio,
// lock at the start, reserve can't score, history across matches, bye, W.O.,
// admin correction and Beyblade stats.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import { prepareDeck } from "../../src/lib/deckRegistration";
import { claimRegistrationSpot } from "../../src/lib/registration-service";
import { setTrio, lockTrios, trioView, correctLockedTrio, currentTrioOf } from "../../src/lib/matchTrio";
import { recordPoint } from "../../src/lib/match-scoring";
import { updateBeybladeStats } from "../../src/lib/tournament-engine";

after(async () => { await prisma.$disconnect(); });
const stamp = `p1r${Date.now()}`;
let n = 0;
const mkUser = (tag: string) => prisma.user.create({ data: { name: `U ${tag}`, bladerName: `U ${tag}`, email: `${stamp}-${tag}-${n++}@it.test`, password: "x" } });
const mkBey = (userId: string, i: number, bit = `Bit${i}`) =>
  prisma.beyblade.create({ data: { userId, name: `Bey ${i}`, beyLine: "BX", blade: `Blade${i}-${userId.slice(-4)}`, ratchet: `${i}-60`, bit } });

async function event(official = true, extra: Record<string, unknown> = {}) {
  const org = await mkUser("org");
  return prisma.tournament.create({ data: { name: `${stamp} 3on3+1`, format: "SWISS", status: "REGISTRATION", organizerId: org.id, deckType: "THREE_ON_THREE_PLUS_ONE", isOfficial: official, ...extra } });
}
async function player(tId: string, official = true) {
  const u = await mkUser("p");
  const beys = [await mkBey(u.id, 1), await mkBey(u.id, 2), await mkBey(u.id, 3), await mkBey(u.id, 4)];
  const deck = await prepareDeck({ deckType: "THREE_ON_THREE_PLUS_ONE", official, ownerId: u.id, ids: beys.map((b) => b.id) });
  assert.ok(deck.ok, JSON.stringify(deck));
  const r = await claimRegistrationSpot(tId, u.id, { ...(deck as { columns: never }).columns, approved: true });
  assert.ok(r.ok);
  return { u, beys: beys.map((b) => b.id) };
}
const staff = (id: string) => ({ id, role: "admin" });
const pt = (matchId: string, scorerId: string, beybladeId: string | null, actionId: string) =>
  recordPoint(matchId, { scorerId, finishType: "SPIN_FINISH", points: 1, beybladeId, actionId, setsToWin: 2, pointsToWinSet: 2 });

test("registration: exactly 4 distinct own Beyblades, valid trio required in official events", async () => {
  const t = await event(true);
  const u = await mkUser("r");
  const other = await mkUser("o");
  const mine = [await mkBey(u.id, 1), await mkBey(u.id, 2), await mkBey(u.id, 3), await mkBey(u.id, 4), await mkBey(u.id, 5)];
  const foreign = await mkBey(other.id, 9);
  const prep = (ids: string[]) => prepareDeck({ deckType: t.deckType, official: true, ownerId: u.id, ids });
  assert.equal((await prep(mine.slice(0, 3).map((b) => b.id))).ok, false, "3 rejected");
  assert.equal((await prep(mine.map((b) => b.id))).ok, false, "5 rejected");
  assert.equal((await prep([mine[0].id, mine[0].id, mine[1].id, mine[2].id])).ok, false, "repeated id rejected");
  assert.equal((await prep([mine[0].id, mine[1].id, mine[2].id, foreign.id])).ok, false, "another account's Beyblade rejected");
  // 4 sharing one bit → no valid trio at all in an official event.
  const s1 = await mkBey(u.id, 11, "Same"), s2 = await mkBey(u.id, 12, "Same"), s3 = await mkBey(u.id, 13, "Same"), s4 = await mkBey(u.id, 14, "Same");
  const none = await prep([s1.id, s2.id, s3.id, s4.id]);
  assert.equal(none.ok, false);
  assert.match((none as { error: string }).error, /Nenhuma combinação/);
  const ok = await prep(mine.slice(0, 4).map((b) => b.id));
  assert.ok(ok.ok);
  const cols = (ok as { columns: { beyblade4: string; deckSnapshot: unknown[] } }).columns;
  assert.equal(cols.beyblade4, mine[3].id);
  assert.equal(cols.deckSnapshot.length, 4);
});

test("snapshot: editing the profile after registration doesn't change the event deck", async () => {
  const t = await event(true);
  const p = await player(t.id);
  await prisma.beyblade.update({ where: { id: p.beys[0] }, data: { bit: "Changed later", name: "Renamed" } });
  const m = await prisma.match.create({ data: { tournamentId: t.id, round: 1, player1Id: p.u.id, player2Id: (await player(t.id)).u.id } });
  const v = await trioView(m.id, { id: p.u.id, staff: false });
  const reg = v!.players.find((x) => x.userId === p.u.id)!.registered;
  assert.equal(reg.find((b) => b.id === p.beys[0])!.bit, "Bit1");
  assert.equal(reg.find((b) => b.id === p.beys[0])!.name, "Bey 1");
});

test("per match: 3 of the 4, reserve derived, revisable before the lock, persisted, hidden from the opponent", async () => {
  const t = await event(true);
  const a = await player(t.id), b = await player(t.id);
  const m = await prisma.match.create({ data: { tournamentId: t.id, round: 1, player1Id: a.u.id, player2Id: b.u.id } });
  assert.equal((await setTrio({ matchId: m.id, userId: a.u.id, beybladeIds: [a.beys[0], a.beys[1]], actor: { id: a.u.id, role: "player" } })).ok, false);
  assert.equal((await setTrio({ matchId: m.id, userId: a.u.id, beybladeIds: [a.beys[0], a.beys[1], b.beys[0]], actor: { id: a.u.id, role: "player" } })).ok, false, "5th/foreign rejected");
  const r1 = await setTrio({ matchId: m.id, userId: a.u.id, beybladeIds: [a.beys[0], a.beys[1], a.beys[2]], actor: { id: a.u.id, role: "player" } });
  assert.ok(r1.ok && r1.reserveId === a.beys[3] && r1.revision === 1);
  const r2 = await setTrio({ matchId: m.id, userId: a.u.id, beybladeIds: [a.beys[1], a.beys[2], a.beys[3]], actor: { id: a.u.id, role: "player" } });
  assert.ok(r2.ok && r2.reserveId === a.beys[0] && r2.revision === 2, "revised");
  // Persisted (survives reload / other device): read it back from the DB.
  assert.deepEqual((await currentTrioOf(m.id, a.u.id))!.sort(), [a.beys[1], a.beys[2], a.beys[3]].sort());
  // Opponent can't see A's trio until both confirmed; staff can.
  let vb = await trioView(m.id, { id: b.u.id, staff: false });
  assert.equal(vb!.players.find((x) => x.userId === a.u.id)!.active, null);
  assert.equal(vb!.players.find((x) => x.userId === a.u.id)!.confirmed, true);
  assert.ok((await trioView(m.id, { id: "judge", staff: true }))!.players.find((x) => x.userId === a.u.id)!.active);
  // B confirms; B can still revise (A confirming doesn't block B).
  assert.ok((await setTrio({ matchId: m.id, userId: b.u.id, beybladeIds: [b.beys[0], b.beys[1], b.beys[2]], actor: { id: b.u.id, role: "player" } })).ok);
  vb = await trioView(m.id, { id: b.u.id, staff: false });
  assert.ok(vb!.players.find((x) => x.userId === a.u.id)!.active, "revealed after both confirmed");
  assert.ok((await setTrio({ matchId: m.id, userId: b.u.id, beybladeIds: [b.beys[1], b.beys[2], b.beys[3]], actor: { id: b.u.id, role: "player" } })).ok);
  // Each revision is audited with its author.
  assert.ok((await prisma.matchAuditLog.count({ where: { matchId: m.id, op: "trio_select" } })) >= 4);
});

test("start: both trios required; lock blocks changes; reserve can't score; next sets keep the trio", async () => {
  const t = await event(true);
  const a = await player(t.id), b = await player(t.id);
  const m = await prisma.match.create({ data: { tournamentId: t.id, round: 1, player1Id: a.u.id, player2Id: b.u.id } });
  await setTrio({ matchId: m.id, userId: a.u.id, beybladeIds: a.beys.slice(0, 3), actor: { id: a.u.id, role: "player" } });
  const early = await lockTrios(m.id);
  assert.ok(early && !early.ok && early.code === "TRIO_MISSING", "can't start with one trio");
  // A point can't be recorded before both trios exist either.
  assert.equal((await pt(m.id, a.u.id, a.beys[0], `${stamp}-x0`)).kind, "error");
  await setTrio({ matchId: m.id, userId: b.u.id, beybladeIds: b.beys.slice(1, 4), actor: { id: b.u.id, role: "player" } });
  const lock = await lockTrios(m.id);
  assert.ok(lock && lock.ok);
  assert.equal((await setTrio({ matchId: m.id, userId: a.u.id, beybladeIds: a.beys.slice(1, 4), actor: { id: a.u.id, role: "player" } })).ok, false, "locked");
  // Reserve (a.beys[3]) and B's reserve (b.beys[0]) can't score; missing bey rejected.
  const res = await pt(m.id, a.u.id, a.beys[3], `${stamp}-x1`);
  assert.equal(res.kind, "error");
  assert.match((res as { error: string }).error, /reserva/);
  assert.equal((await pt(m.id, b.u.id, b.beys[0], `${stamp}-x2`)).kind, "error");
  assert.equal((await pt(m.id, a.u.id, null, `${stamp}-x3`)).kind, "error");
  // Set 1 (A wins 2-0 to 2), set 2 keeps the same trio.
  assert.equal((await pt(m.id, a.u.id, a.beys[0], `${stamp}-1`)).kind, "ok");
  assert.equal((await pt(m.id, a.u.id, a.beys[1], `${stamp}-2`)).kind, "ok");
  assert.equal((await pt(m.id, b.u.id, b.beys[3], `${stamp}-3`)).kind, "ok"); // set 2
  assert.equal((await pt(m.id, b.u.id, b.beys[0], `${stamp}-4`)).kind, "error", "reserve still out in set 2");
  const fin = await pt(m.id, a.u.id, a.beys[2], `${stamp}-5`);
  const fin2 = fin.kind === "ok" && !fin.finishedNow ? await pt(m.id, a.u.id, a.beys[2], `${stamp}-6`) : fin;
  assert.ok(fin2.kind === "ok");
  const pts = await prisma.matchPoint.findMany({ where: { matchId: m.id } });
  assert.ok(pts.every((p) => p.beybladeId !== a.beys[3] && p.beybladeId !== b.beys[0]), "no point for a reserve");
});

test("race: trio change vs first point — never a point under a different trio", async () => {
  const t = await event(false);
  for (let i = 0; i < 5; i++) {
    const a = await player(t.id, false), b = await player(t.id, false);
    const m = await prisma.match.create({ data: { tournamentId: t.id, round: 1, player1Id: a.u.id, player2Id: b.u.id } });
    await setTrio({ matchId: m.id, userId: a.u.id, beybladeIds: a.beys.slice(0, 3), actor: { id: a.u.id, role: "player" } });
    await setTrio({ matchId: m.id, userId: b.u.id, beybladeIds: b.beys.slice(0, 3), actor: { id: b.u.id, role: "player" } });
    // Concurrently: A swaps bey[0] for the reserve while the judge scores with bey[0].
    const [chg, point] = await Promise.all([
      setTrio({ matchId: m.id, userId: a.u.id, beybladeIds: a.beys.slice(1, 4), actor: { id: a.u.id, role: "player" } }),
      pt(m.id, a.u.id, a.beys[0], `${stamp}-race-${i}`),
    ]);
    const finalTrio = (await currentTrioOf(m.id, a.u.id))!;
    if (point.kind === "ok") {
      assert.equal(chg.ok, false, "change must lose once the point locked the trio");
      assert.ok(finalTrio.includes(a.beys[0]));
    } else {
      assert.ok(chg.ok, "the change won; the point was refused (bey[0] became the reserve)");
      assert.ok(!finalTrio.includes(a.beys[0]));
    }
    const locked = await prisma.matchTrioSelection.findMany({ where: { matchId: m.id } });
    const scored = await prisma.matchPoint.findMany({ where: { matchId: m.id } });
    for (const s of scored) assert.ok([locked.find((x) => x.userId === s.userId)!.bey1Id, locked.find((x) => x.userId === s.userId)!.bey2Id, locked.find((x) => x.userId === s.userId)!.bey3Id].includes(s.beybladeId!));
  }
});

test("between matches: new independent trio, can return to an earlier one, history unchanged (Swiss and knockout)", async () => {
  const t = await event(true);
  const a = await player(t.id), b = await player(t.id);
  const r1 = await prisma.match.create({ data: { tournamentId: t.id, round: 1, player1Id: a.u.id, player2Id: b.u.id } });
  await setTrio({ matchId: r1.id, userId: a.u.id, beybladeIds: a.beys.slice(0, 3), actor: { id: a.u.id, role: "player" } });
  await setTrio({ matchId: r1.id, userId: b.u.id, beybladeIds: b.beys.slice(0, 3), actor: { id: b.u.id, role: "player" } });
  await lockTrios(r1.id);
  const ko = await prisma.match.create({ data: { tournamentId: t.id, round: 4, bracketPos: 0, player1Id: a.u.id, player2Id: b.u.id } }); // knockout round
  const third = await prisma.match.create({ data: { tournamentId: t.id, round: 5, isThirdPlace: true, player1Id: a.u.id, player2Id: b.u.id } });
  const view = await trioView(ko.id, { id: a.u.id, staff: false });
  assert.deepEqual(view!.players.find((x) => x.userId === a.u.id)!.previousTrio, a.beys.slice(0, 3), "offers the previous trio");
  assert.equal(view!.players.find((x) => x.userId === a.u.id)!.confirmed, false, "never auto-confirmed");
  assert.ok((await setTrio({ matchId: ko.id, userId: a.u.id, beybladeIds: a.beys.slice(1, 4), actor: { id: a.u.id, role: "player" } })).ok, "uses the reserve now");
  assert.ok((await setTrio({ matchId: third.id, userId: a.u.id, beybladeIds: a.beys.slice(0, 3), actor: { id: a.u.id, role: "player" } })).ok, "back to the first trio");
  const hist = await prisma.matchTrioSelection.findUnique({ where: { matchId_userId: { matchId: r1.id, userId: a.u.id } } });
  assert.deepEqual([hist!.bey1Id, hist!.bey2Id, hist!.bey3Id], a.beys.slice(0, 3), "round 1 unchanged");
  assert.ok(hist!.lockedAt && hist!.lockedSnapshot);
});

test("bye needs no trio and creates no usage", async () => {
  const t = await event(true);
  const a = await player(t.id);
  const bye = await prisma.match.create({ data: { tournamentId: t.id, round: 1, player1Id: a.u.id, player2Id: a.u.id, status: "FINISHED", winnerId: a.u.id } });
  const r = await setTrio({ matchId: bye.id, userId: a.u.id, beybladeIds: a.beys.slice(0, 3), actor: { id: a.u.id, role: "player" } });
  assert.equal(r.ok, false);
  assert.equal(await lockTrios(bye.id), null);
  assert.equal(await prisma.matchTrioSelection.count({ where: { matchId: bye.id } }), 0);
});

test("stats: only active Beyblades; reserve gets nothing; W.O. without battles records no usage", async () => {
  const t = await event(true);
  const a = await player(t.id), b = await player(t.id);
  await prisma.tournament.update({ where: { id: t.id }, data: { status: "IN_PROGRESS" } });
  const m = await prisma.match.create({ data: { tournamentId: t.id, round: 1, player1Id: a.u.id, player2Id: b.u.id } });
  await setTrio({ matchId: m.id, userId: a.u.id, beybladeIds: a.beys.slice(0, 3), actor: { id: a.u.id, role: "player" } });
  await setTrio({ matchId: m.id, userId: b.u.id, beybladeIds: b.beys.slice(1, 4), actor: { id: b.u.id, role: "player" } });
  await pt(m.id, a.u.id, a.beys[1], `${stamp}-s1`);
  await pt(m.id, a.u.id, a.beys[1], `${stamp}-s2`);
  await pt(m.id, a.u.id, a.beys[1], `${stamp}-s3`);
  await pt(m.id, a.u.id, a.beys[1], `${stamp}-s4`);
  await updateBeybladeStats(m.id, a.u.id, b.u.id);
  const recs = await prisma.beybladeMatchRecord.findMany({ where: { matchId: m.id } });
  assert.ok(recs.some((r) => r.beybladeId === a.beys[1] && r.won));
  // B scored nothing: credited to an ACTIVE one (first of the trio), never the reserve b.beys[0].
  assert.ok(recs.every((r) => r.beybladeId !== a.beys[3] && r.beybladeId !== b.beys[0]));
  // W.O. with no battle: no Beyblade usage at all.
  const wo = await prisma.match.create({ data: { tournamentId: t.id, round: 2, player1Id: a.u.id, player2Id: b.u.id, status: "FINISHED", winnerId: a.u.id, isWalkover: true } });
  await updateBeybladeStats(wo.id, a.u.id, b.u.id);
  assert.equal(await prisma.beybladeMatchRecord.count({ where: { matchId: wo.id } }), 0);
});

test("admin correction after the lock: reason required, audited, points keep their Beyblade, finished match frozen", async () => {
  const t = await event(true);
  const a = await player(t.id), b = await player(t.id);
  const m = await prisma.match.create({ data: { tournamentId: t.id, round: 1, player1Id: a.u.id, player2Id: b.u.id } });
  await setTrio({ matchId: m.id, userId: a.u.id, beybladeIds: a.beys.slice(0, 3), actor: { id: a.u.id, role: "player" } });
  await setTrio({ matchId: m.id, userId: b.u.id, beybladeIds: b.beys.slice(0, 3), actor: { id: b.u.id, role: "player" } });
  await pt(m.id, a.u.id, a.beys[0], `${stamp}-c1`);
  assert.equal((await correctLockedTrio({ matchId: m.id, userId: a.u.id, beybladeIds: a.beys.slice(1, 4), reason: "", actor: staff("adm") })).ok, false);
  const c = await correctLockedTrio({ matchId: m.id, userId: a.u.id, beybladeIds: a.beys.slice(1, 4), reason: "Juiz registrou a Beyblade errada", actor: staff("adm") });
  assert.ok(c.ok && c.removed[0] === a.beys[0]);
  const p0 = await prisma.matchPoint.findFirst({ where: { matchId: m.id } });
  assert.equal(p0!.beybladeId, a.beys[0], "existing point not reassigned");
  assert.equal(await prisma.matchAuditLog.count({ where: { matchId: m.id, op: "trio_correction" } }), 1);
  await prisma.match.update({ where: { id: m.id }, data: { status: "FINISHED", winnerId: a.u.id } });
  assert.equal((await correctLockedTrio({ matchId: m.id, userId: a.u.id, beybladeIds: a.beys.slice(0, 3), reason: "tarde demais", actor: staff("adm") })).ok, false);
});

test("legacy formats keep working: 3on3 point needs no trio", async () => {
  const org = await mkUser("o3");
  const t = await prisma.tournament.create({ data: { name: `${stamp} 3on3`, format: "SWISS", status: "IN_PROGRESS", organizerId: org.id, deckType: "THREE_ON_THREE" } });
  const a = await mkUser("l1"), b = await mkUser("l2");
  const m = await prisma.match.create({ data: { tournamentId: t.id, round: 1, player1Id: a.id, player2Id: b.id } });
  assert.equal((await pt(m.id, a.id, null, `${stamp}-legacy`)).kind, "ok");
  assert.equal(await lockTrios(m.id), null);
});
