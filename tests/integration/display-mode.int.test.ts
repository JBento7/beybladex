// Judging mode (disposable DB, docs/MODO-ARBITRAGEM.md): "Com telão Arena"
// requires deck orders where the format has them (start, points, new set or
// cycle); "Somente placar do juiz" never does, broadcasts nothing, guesses no
// Beyblade; results are the same in both; mode changes are permissioned and
// locked once battles begin; old events behave as ARENA.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import { recordPoint } from "../../src/lib/match-scoring";
import { startBattleGate, telaoOnlyGate } from "../../src/lib/matchGate";
import { loadMatchState } from "../../src/lib/matchState";
import { setTrio } from "../../src/lib/matchTrio";
import { arenaMatchWhere } from "../../src/lib/arenaIdentity";
import { changeDisplayMode } from "../../src/lib/displayModeStore";
import { recalculateStandings, updateBeybladeStats } from "../../src/lib/tournament-engine";

after(async () => { await prisma.$disconnect(); });
const tag = `dm${Date.now()}`;
let n = 0;
const mkUser = (role: "PARTICIPANT" | "ORGANIZER" = "PARTICIPANT") =>
  prisma.user.create({ data: { name: `U${n}`, bladerName: `${tag}-${n}`, email: `${tag}-${n++}@it.test`, password: "x", role } });
const mkBey = (userId: string, i: number) => prisma.beyblade.create({ data: { userId, name: `Bey ${i}`, beyLine: "BX", blade: `B${i}-${userId.slice(-5)}`, ratchet: `${i}-60`, bit: `Bit${i}` } });

type Mode = "ARENA" | "JUDGE_ONLY" | undefined;
async function setup(deckType: "SOLO" | "THREE_ON_THREE" | "THREE_ON_THREE_PLUS_ONE", displayMode: Mode, opts: { community?: string; arena?: number; noSides?: boolean } = {}) {
  const org = await mkUser();
  const t = await prisma.tournament.create({
    data: { name: `${tag} ${deckType} ${displayMode ?? "legado"}`, format: "SWISS", status: "IN_PROGRESS", organizerId: org.id, deckType, setsToWin: 2, pointsToWinSet: 4, communitySlug: opts.community ?? "lbl", ...(displayMode ? { displayMode } : {}) },
  });
  const size = deckType === "SOLO" ? 1 : deckType === "THREE_ON_THREE" ? 3 : 4;
  const player = async () => {
    const u = await mkUser();
    const beys = [];
    for (let i = 1; i <= size; i++) beys.push((await mkBey(u.id, i)).id);
    await prisma.tournamentParticipant.create({ data: { tournamentId: t.id, userId: u.id, approved: true, beyblade1: beys[0], beyblade2: beys[1] ?? null, beyblade3: beys[2] ?? null, beyblade4: beys[3] ?? null } });
    return { id: u.id, beys };
  };
  const a = await player(), b = await player();
  const m = await prisma.match.create({ data: { tournamentId: t.id, round: 1, player1Id: a.id, player2Id: b.id, arena: opts.arena ?? 1, xSidePlayerId: opts.noSides ? null : b.id } });
  return { t, org, a, b, m };
}
const audit = { actorId: "judge", actorRole: "judge" };
const pt = (matchId: string, scorerId: string, actionId: string, beybladeId: string | null = null, finishType: "SPIN_FINISH" | "BURST_FINISH" = "SPIN_FINISH") =>
  recordPoint(matchId, { scorerId, finishType, points: finishType === "SPIN_FINISH" ? 1 : 2, beybladeId, actionId, setsToWin: 2, pointsToWinSet: 4 }, audit);
const order = (matchId: string, p: { id: string; beys: string[] }, setNumber: number, cycleIndex: number) =>
  prisma.matchDeckOrder.create({ data: { matchId, userId: p.id, setNumber, cycleIndex, bey1Id: p.beys[0], bey2Id: p.beys[1], bey3Id: p.beys[2] } });

test("ARENA + 3on3: start and points need both orders; new cycle and new set ask again; the pending players are named", async () => {
  const x = await setup("THREE_ON_THREE", "ARENA");
  const g0 = await startBattleGate(x.m.id);
  assert.ok(!g0.ok && g0.code === "DECK_ORDER_MISSING");
  assert.equal(g0.missing?.length, 2, "both players listed");
  assert.equal((await pt(x.m.id, x.a.id, `${tag}-a0`)).kind, "error", "server refuses the point too");
  const st0 = await loadMatchState(x.m.id, null);
  assert.equal(st0!.orderRequired, true);
  assert.deepEqual(st0!.orderPending.map((p) => p.userId).sort(), [x.a.id, x.b.id].sort());

  await order(x.m.id, x.a, 1, 0);
  const g1 = await startBattleGate(x.m.id);
  assert.ok(!g1.ok && g1.missing?.length === 1 && g1.missing[0].userId === x.b.id, "only the one still missing");
  await order(x.m.id, x.b, 1, 0);
  assert.ok((await startBattleGate(x.m.id)).ok);
  for (let i = 0; i < 3; i++) assert.equal((await pt(x.m.id, i % 2 ? x.b.id : x.a.id, `${tag}-a${i + 1}`, x.a.beys[0])).kind, "ok");
  // 4th battle = cycle 2 of set 1: a new order is required.
  const c2 = await pt(x.m.id, x.a.id, `${tag}-a4`);
  assert.ok(c2.kind === "error" && c2.code === "DECK_ORDER_MISSING");
  await order(x.m.id, x.a, 1, 1); await order(x.m.id, x.b, 1, 1);
  assert.equal((await pt(x.m.id, x.a.id, `${tag}-a4`)).kind, "ok");
  assert.equal((await pt(x.m.id, x.a.id, `${tag}-a5`)).kind, "ok"); // A: 4 → set 1 won
  // Set 2 needs its own orders.
  const s2 = await startBattleGate(x.m.id);
  assert.ok(!s2.ok && s2.code === "DECK_ORDER_MISSING");
  assert.ok((await pt(x.m.id, x.a.id, `${tag}-a6`)).kind === "error");
});

test("ARENA + SOLO: no order ever (no deck order exists)", async () => {
  const x = await setup("SOLO", "ARENA");
  assert.ok((await startBattleGate(x.m.id)).ok);
  for (let i = 0; i < 8; i++) assert.equal((await pt(x.m.id, x.a.id, `${tag}-s${i}`)).kind, "ok");
  assert.equal((await prisma.match.findUnique({ where: { id: x.m.id } }))!.winnerId, x.a.id);
  assert.equal((await loadMatchState(x.m.id, null))!.orderRequired, false);
});

test("legacy event (no mode stored) behaves as ARENA", async () => {
  const x = await setup("THREE_ON_THREE", undefined);
  assert.equal(x.t.displayMode, "ARENA");
  assert.ok(!(await startBattleGate(x.m.id)).ok);
});

test("JUDGE_ONLY + 3on3: start and score through sets and cycles without any order; nothing credited to a guessed Beyblade", async () => {
  const x = await setup("THREE_ON_THREE", "JUDGE_ONLY");
  await prisma.tournament.update({ where: { id: x.t.id }, data: { isTest: false } });
  const g = await startBattleGate(x.m.id);
  assert.ok(g.ok && g.mode === "JUDGE_ONLY");
  // Set 1: A 4 (4 battles = past the first cycle), set 2: A 4 → A wins 2-0.
  for (let i = 0; i < 8; i++) {
    const r = await pt(x.m.id, x.a.id, `${tag}-j${i}`);
    assert.equal(r.kind, "ok", `battle ${i + 1} (set ${i < 4 ? 1 : 2}) needs no order`);
  }
  const m = await prisma.match.findUnique({ where: { id: x.m.id } });
  assert.equal(m!.winnerId, x.a.id);
  assert.equal(await prisma.matchDeckOrder.count({ where: { matchId: x.m.id } }), 0);
  assert.ok((await prisma.matchPoint.findMany({ where: { matchId: x.m.id } })).every((p) => p.beybladeId === null));
  await updateBeybladeStats(x.m.id, x.a.id, x.b.id);
  assert.equal(await prisma.beybladeMatchRecord.count({ where: { matchId: x.m.id } }), 0, "no Beyblade credited by assumption (not the first registered)");
  const st = await loadMatchState(x.m.id, null);
  assert.equal(st!.displayMode, "JUDGE_ONLY");
  assert.equal(st!.orderRequired, false);
});

test("JUDGE_ONLY: optional identification is recorded; a Beyblade outside the deck is refused", async () => {
  const x = await setup("THREE_ON_THREE", "JUDGE_ONLY");
  const other = await mkUser();
  const foreign = await mkBey(other.id, 9);
  assert.equal((await pt(x.m.id, x.a.id, `${tag}-o1`, foreign.id)).kind, "error");
  assert.equal((await pt(x.m.id, x.a.id, `${tag}-o2`, x.a.beys[1])).kind, "ok");
  for (let i = 3; i <= 9; i++) await pt(x.m.id, x.a.id, `${tag}-o${i}`);
  await updateBeybladeStats(x.m.id, x.a.id, x.b.id);
  const recs = await prisma.beybladeMatchRecord.findMany({ where: { matchId: x.m.id } });
  assert.deepEqual(recs.map((r) => r.beybladeId), [x.a.beys[1]], "only the identified one; B (unidentified) gets none");
});

test("JUDGE_ONLY + 3on3+1: starts without trios; declared trios still lock and the reserve still can't score", async () => {
  const x = await setup("THREE_ON_THREE_PLUS_ONE", "JUDGE_ONLY");
  assert.ok((await startBattleGate(x.m.id)).ok, "no trio needed to start");
  assert.equal((await pt(x.m.id, x.a.id, `${tag}-p1`)).kind, "ok", "point without a Beyblade");
  assert.equal(await prisma.matchTrioSelection.count({ where: { matchId: x.m.id } }), 0);

  const y = await setup("THREE_ON_THREE_PLUS_ONE", "JUDGE_ONLY");
  await setTrio({ matchId: y.m.id, userId: y.a.id, beybladeIds: y.a.beys.slice(0, 3), actor: { id: y.a.id, role: "player" } });
  await setTrio({ matchId: y.m.id, userId: y.b.id, beybladeIds: y.b.beys.slice(0, 3), actor: { id: y.b.id, role: "player" } });
  assert.ok((await startBattleGate(y.m.id)).ok);
  assert.equal(await prisma.matchTrioSelection.count({ where: { matchId: y.m.id, lockedAt: { not: null } } }), 2, "declared trios locked at the start");
  const res = await pt(y.m.id, y.a.id, `${tag}-p2`, y.a.beys[3]);
  assert.ok(res.kind === "error" && /reserva/.test(res.error), "reserve rule kept");
  assert.equal((await pt(y.m.id, y.a.id, `${tag}-p3`)).kind, "ok", "identification optional");
});

test("ARENA + 3on3+1 keeps requiring both trios before the start", async () => {
  const x = await setup("THREE_ON_THREE_PLUS_ONE", "ARENA");
  const g = await startBattleGate(x.m.id);
  assert.ok(!g.ok && g.code === "TRIO_MISSING");
  assert.equal(await prisma.matchTrioSelection.count({ where: { matchId: x.m.id, lockedAt: { not: null } } }), 0, "a refused start locks nothing");
});

test("telão: judge-only matches never show, queue or signal; another event on the same arena keeps working", async () => {
  const community = `c${Date.now().toString(36)}`;
  const on = await setup("SOLO", "ARENA", { community, arena: 1 });
  const off = await setup("SOLO", "JUDGE_ONLY", { community, arena: 1 });
  const now = new Date();
  await prisma.match.updateMany({ where: { id: { in: [on.m.id, off.m.id] } }, data: { onAirAt: now, countdownAt: now } });
  const seen = await prisma.match.findMany({ where: { ...arenaMatchWhere(1, community), onAirAt: { gte: new Date(Date.now() - 25000) } }, select: { id: true } });
  assert.deepEqual(seen.map((m) => m.id), [on.m.id]);
  const queue = await prisma.match.findMany({ where: { ...arenaMatchWhere(1, community), status: "PENDING", tournament: { status: "IN_PROGRESS" } }, select: { id: true } });
  assert.deepEqual(queue.map((m) => m.id), [on.m.id], "queue only lists the broadcast event");
  // Telão-only operations are refused for the judge-only match.
  assert.equal((await telaoOnlyGate(off.m.id))?.code, "BROADCAST_DISABLED");
  assert.equal(await telaoOnlyGate(on.m.id), null);
  // Only judge-only events: nothing for this arena.
  const solo = `${community}x`;
  const lone = await setup("SOLO", "JUDGE_ONLY", { community: solo, arena: 1 });
  await prisma.match.update({ where: { id: lone.m.id }, data: { onAirAt: now } });
  assert.equal(await prisma.match.count({ where: arenaMatchWhere(1, solo) }), 0);
});

test("same results, standings and stats rules in both modes", async () => {
  const seq = (a: string, b: string) => [a, b, a, a, a, b, b, a, a, a];
  const out: Record<string, unknown>[] = [];
  for (const mode of ["ARENA", "JUDGE_ONLY"] as const) {
    const x = await setup("SOLO", mode);
    let i = 0;
    for (const s of seq(x.a.id, x.b.id)) {
      const r = await pt(x.m.id, s, `${tag}-eq-${mode}-${i++}`, null, i % 3 === 0 ? "BURST_FINISH" : "SPIN_FINISH");
      if (r.kind === "ok" && r.finishedNow) break;
    }
    await recalculateStandings(x.t.id, x.a.id);
    await recalculateStandings(x.t.id, x.b.id);
    const m = await prisma.match.findUnique({ where: { id: x.m.id }, include: { sets: { orderBy: { setNumber: "asc" } } } });
    const parts = await prisma.tournamentParticipant.findMany({ where: { tournamentId: x.t.id }, orderBy: { createdAt: "asc" } });
    out.push({
      winner: m!.winnerId === x.a.id ? "A" : "B",
      sets: m!.sets.map((s) => [s.player1Points, s.player2Points, s.winnerId === x.a.id ? "A" : "B"]),
      standings: parts.map((p) => ({ wins: p.wins, losses: p.losses, totalPoints: p.totalPoints, rankingPoints: p.rankingPoints })),
    });
  }
  assert.deepEqual(out[0], out[1]);
});

test("mode change: organizer/admin only, before the first battle; locked (with reason) after; recorded", async () => {
  const x = await setup("THREE_ON_THREE", "ARENA");
  const stranger = await mkUser();
  const admin = await mkUser("ORGANIZER");
  const actor = (u: { id: string; role: string }) => ({ id: u.id, role: u.role, canJudge: false, adminCommunity: null });
  assert.equal((await changeDisplayMode(x.t.id, "JUDGE_ONLY", null)).status, 401);
  assert.equal((await changeDisplayMode(x.t.id, "JUDGE_ONLY", actor(stranger))).status, 403);
  assert.equal((await changeDisplayMode(x.t.id, "JUDGE_ONLY", { ...actor(admin), canJudge: true, role: "PARTICIPANT" })).status, 403, "judge permission is not enough");
  assert.equal((await changeDisplayMode(x.t.id, "QUALQUER", actor(admin))).status, 400);
  assert.equal((await changeDisplayMode(x.t.id, "JUDGE_ONLY", actor(x.org))).status, 200, "organizer corrects it before the first battle");
  assert.equal((await prisma.tournament.findUnique({ where: { id: x.t.id } }))!.displayMode, "JUDGE_ONLY");
  assert.equal((await changeDisplayMode(x.t.id, "ARENA", actor(admin))).status, 200, "admin too");
  assert.equal(await prisma.tournamentAdminAction.count({ where: { tournamentId: x.t.id, kind: "DISPLAY_MODE" } }), 2);
  // First battle (points need the orders in ARENA).
  await order(x.m.id, x.a, 1, 0); await order(x.m.id, x.b, 1, 0);
  assert.equal((await pt(x.m.id, x.a.id, `${tag}-lock`)).kind, "ok");
  const locked = await changeDisplayMode(x.t.id, "JUDGE_ONLY", actor(x.org));
  assert.equal(locked.status, 409);
  assert.match(locked.body.error!, /já começaram/);
  assert.equal((await prisma.tournament.findUnique({ where: { id: x.t.id } }))!.displayMode, "ARENA", "unchanged");
  assert.equal(await prisma.matchDeckOrder.count({ where: { matchId: x.m.id } }), 2, "orders untouched");
});

// "Lados dos jogadores" in both modes (docs/MODO-ARBITRAGEM.md §3).
test("sides: required before the first battle in BOTH modes; judge-only still needs no order and broadcasts nothing", async () => {
  const { authorizeMatchOp } = await import("../../src/lib/matchAccess");
  for (const mode of ["ARENA", "JUDGE_ONLY"] as const) {
    const x = await setup("THREE_ON_THREE", mode, { noSides: true });
    if (mode === "ARENA") { await order(x.m.id, x.a, 1, 0); await order(x.m.id, x.b, 1, 0); }
    const g = await startBattleGate(x.m.id);
    assert.ok(!g.ok && g.code === "SIDES_MISSING", `${mode}: start blocked without sides`);
    // Choosing sides is the scoring permission (organizer yes, a stranger no) — no telão gate.
    const orgSession = { user: { id: x.org.id, role: "ORGANIZER" } } as never;
    const stranger = await mkUser();
    assert.equal((await authorizeMatchOp(orgSession, x.m.id, "sides")).ok, true);
    assert.equal((await authorizeMatchOp({ user: { id: stranger.id, role: "PARTICIPANT" } } as never, x.m.id, "sides")).ok, false, "unauthorized user refused");
    await prisma.match.update({ where: { id: x.m.id }, data: { xSidePlayerId: x.a.id } });
    assert.ok((await startBattleGate(x.m.id)).ok, `${mode}: start released after the choice`);
    if (mode === "JUDGE_ONLY") {
      const tg = await telaoOnlyGate(x.m.id);
      assert.ok(!tg.ok && tg.code === "BROADCAST_DISABLED", "telão commands stay off");
      const st = await loadMatchState(x.m.id, null);
      assert.equal(st!.orderRequired, false, "still no deck order");
      assert.equal(st!.xSidePlayerId, x.a.id, "sides persist (reload)");
    }
  }
});

test("sides: an older match under way without sides is not interrupted; scoring keeps crediting the player", async () => {
  const x = await setup("SOLO", "JUDGE_ONLY", { noSides: true });
  // Points already scored before the feature: the start gate doesn't block it.
  await prisma.match.update({ where: { id: x.m.id }, data: { xSidePlayerId: x.a.id } });
  assert.equal((await pt(x.m.id, x.b.id, `${tag}-ls0`)).kind, "ok");
  await prisma.match.update({ where: { id: x.m.id }, data: { xSidePlayerId: null } });
  assert.ok((await startBattleGate(x.m.id)).ok, "legacy match with battles: no SIDES_MISSING");
  assert.equal((await pt(x.m.id, x.b.id, `${tag}-ls1`)).kind, "ok");
  const st = await loadMatchState(x.m.id, null);
  const pts = st!.sets.flatMap((s: { points?: { scorerId: string }[] }) => s.points ?? []);
  assert.ok(pts.every((p) => p.scorerId === x.b.id), "points keep the player id, whatever the sides");
});
