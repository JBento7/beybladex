// Judge scoring safety (disposable DB, docs/JUIZ-TELAO.md): idempotent
// actions, concurrent finals, context checks, action status, guarded undo,
// official state with version and last launch.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import { actionStatus, recordPoint, recordWalkover, undoLastPoint } from "../../src/lib/match-scoring";
import { loadMatchState } from "../../src/lib/matchState";

after(async () => { await prisma.$disconnect(); });
const tag = `js${Date.now()}`;
let n = 0;
const audit = { actorId: "", actorRole: "judge" };
async function mkMatch(rules = { setsToWin: 1, pointsToWinSet: 4 }) {
  const u = () => prisma.user.create({ data: { name: `U${n}`, bladerName: `${tag}-${n}`, email: `${tag}-${n++}@it.test`, password: "x" } });
  const [org, a, b] = [await u(), await u(), await u()];
  audit.actorId = org.id;
  const t = await prisma.tournament.create({ data: { name: `${tag} T${n}`, format: "ROUND_ROBIN", status: "IN_PROGRESS", organizerId: org.id, swissRounds: 3, ...rules } });
  const m = await prisma.match.create({ data: { tournamentId: t.id, player1Id: a.id, player2Id: b.id, round: 2, arena: 2 } });
  return { m, a: a.id, b: b.id, ...rules };
}
const pt = (x: Awaited<ReturnType<typeof mkMatch>>, scorer: string, actionId: string, finishType: "SPIN_FINISH" | "BURST_FINISH" | "EXTREME_FINISH" = "SPIN_FINISH", context?: { setNumber: number; battle: number }) =>
  recordPoint(x.m.id, { scorerId: scorer, finishType, points: finishType === "SPIN_FINISH" ? 1 : finishType === "BURST_FINISH" ? 2 : 3, actionId, setsToWin: x.setsToWin, pointsToWinSet: x.pointsToWinSet, context }, audit);
const count = (id: string) => prisma.matchPoint.count({ where: { matchId: id } });

test("same action twice (sequential or concurrent) stores one point", async () => {
  const x = await mkMatch();
  assert.equal((await pt(x, x.a, `${tag}-a1`)).kind, "ok");
  assert.equal((await pt(x, x.a, `${tag}-a1`)).kind, "replay");
  const both = await Promise.all([pt(x, x.b, `${tag}-a2`), pt(x, x.b, `${tag}-a2`)]);
  assert.deepEqual(both.map((o) => o.kind).sort(), ["ok", "replay"]);
  assert.equal(await count(x.m.id), 2);
  const st = await loadMatchState(x.m.id, null);
  assert.equal(st!.scoreVersion, 2);
  assert.equal(st!.lastLaunch?.actionId, `${tag}-a2`);
  assert.equal(st!.phase, "Suíço — Rodada 2");
});

test("two concurrent finishing points close the match exactly once", async () => {
  const x = await mkMatch();
  await pt(x, x.a, `${tag}-f0`, "EXTREME_FINISH"); // 3 of 4
  const res = await Promise.all([pt(x, x.a, `${tag}-f1`), pt(x, x.b, `${tag}-f2`, "EXTREME_FINISH"), pt(x, x.a, `${tag}-f3`)]);
  const closers = res.filter((o) => o.kind === "ok" && o.finishedNow);
  assert.equal(closers.length, 1);
  const m = await prisma.match.findUniqueOrThrow({ where: { id: x.m.id } });
  assert.equal(m.status, "FINISHED");
  // A refused point after the end carries the reason.
  const late = await pt(x, x.b, `${tag}-f4`);
  assert.equal(late.kind, "error");
  assert.equal((late as { code?: string }).code, "MATCH_FINISHED");
  // W.O. can't close it a second time.
  assert.equal(await recordWalkover(x.m.id, x.b, audit), false);
});

test("a late action is never applied to another battle or the next set", async () => {
  const x = await mkMatch({ setsToWin: 2, pointsToWinSet: 4 });
  assert.equal((await pt(x, x.a, `${tag}-c1`, "SPIN_FINISH", { setNumber: 1, battle: 0 })).kind, "ok");
  // Tap made when the set had 0 battles, arriving after battle 1 was scored → refused.
  const stale = await pt(x, x.b, `${tag}-c2`, "SPIN_FINISH", { setNumber: 1, battle: 0 });
  assert.equal(stale.kind, "error");
  assert.equal((stale as { code?: string }).code, "CONTEXT_CHANGED");
  // Finish set 1 (a reaches 4), then an old set-1 tap must not score in set 2.
  await pt(x, x.a, `${tag}-c3`, "EXTREME_FINISH", { setNumber: 1, battle: 1 });
  const old = await pt(x, x.b, `${tag}-c4`, "SPIN_FINISH", { setNumber: 1, battle: 2 });
  assert.equal((old as { code?: string }).code, "CONTEXT_CHANGED");
  assert.equal((await pt(x, x.b, `${tag}-c5`, "SPIN_FINISH", { setNumber: 2, battle: 0 })).kind, "ok");
  assert.equal(await count(x.m.id), 3);
});

test("action status answers 'processed' after store and after undo; unknown otherwise", async () => {
  const x = await mkMatch();
  assert.equal((await actionStatus(x.m.id, `${tag}-s1`)).processed, false);
  await pt(x, x.a, `${tag}-s1`);
  assert.equal((await actionStatus(x.m.id, `${tag}-s1`)).processed, true);
  await undoLastPoint(x.m.id, { pointsToWinSet: 4 }, audit);
  assert.equal((await actionStatus(x.m.id, `${tag}-s1`)).processed, true, "undone actions must not be resent");
});

test("undo: removes only the expected launch, once per operation id", async () => {
  const x = await mkMatch({ setsToWin: 2, pointsToWinSet: 4 });
  await pt(x, x.a, `${tag}-u1`);
  await pt(x, x.b, `${tag}-u2`, "BURST_FINISH");
  const last = (await loadMatchState(x.m.id, null))!.lastLaunch!;
  assert.equal(last.points, 2);
  // Double tap / resend with the same opId removes one point only.
  const op = `${tag}-undo1`;
  const [r1, r2] = await Promise.all([
    undoLastPoint(x.m.id, { expectedPointId: last.pointId, opId: op, pointsToWinSet: 4 }, audit),
    undoLastPoint(x.m.id, { expectedPointId: last.pointId, opId: op, pointsToWinSet: 4 }, audit),
  ]);
  assert.deepEqual([r1.kind, r2.kind].sort(), ["ok", "replay"]);
  assert.equal(await count(x.m.id), 1);
  // Undo racing a new launch: the panel still shows u1 as last, but u3 arrived.
  const shown = (await loadMatchState(x.m.id, null))!.lastLaunch!.pointId;
  await pt(x, x.b, `${tag}-u3`);
  const raced = await undoLastPoint(x.m.id, { expectedPointId: shown, opId: `${tag}-undo2`, pointsToWinSet: 4 }, audit);
  assert.equal(raced.kind, "error");
  assert.equal((raced as { code: string }).code, "LAST_CHANGED");
  assert.equal(await count(x.m.id), 2);
  // Audit trail of the correction.
  assert.equal(await prisma.matchAuditLog.count({ where: { matchId: x.m.id, op: "undo_point" } }), 1);
});

test("finished match: undo refused with the organizer message; version bumps on W.O.", async () => {
  const x = await mkMatch();
  const v0 = (await loadMatchState(x.m.id, null))!.scoreVersion;
  assert.equal(await recordWalkover(x.m.id, x.a, audit), true);
  const st = (await loadMatchState(x.m.id, null))!;
  assert.equal(st.scoreVersion, v0 + 1);
  const r = await undoLastPoint(x.m.id, { pointsToWinSet: 4 }, audit);
  assert.equal((r as { error: string }).error, "Partida finalizada. Solicite a correção à organização.");
});

test("arena commands: a resend (same commandId) never re-stamps; a recount (new id) does", async () => {
  const { stampArenaSignal, readSignal } = await import("../../src/lib/arenaCommands");
  const { arenaSignalKey } = await import("../../src/lib/arenaIdentity");
  const x = await mkMatch();
  const first = await stampArenaSignal("ready", "lbl", 9, { commandId: `${tag}-cmdA`, matchId: x.m.id });
  await new Promise((r) => setTimeout(r, 15));
  const again = await stampArenaSignal("ready", "lbl", 9, { commandId: `${tag}-cmdA`, matchId: x.m.id });
  assert.equal(again.replay, true);
  assert.equal(again.at, first.at);
  const recount = await stampArenaSignal("ready", "lbl", 9, { commandId: `${tag}-cmdB`, matchId: x.m.id });
  assert.equal(recount.replay, false);
  assert.ok(recount.at > first.at);
  const row = await prisma.arenaLayout.findUnique({ where: { key: arenaSignalKey("ready", "lbl", 9) } });
  assert.deepEqual(readSignal(row?.data), { at: recount.at, commandId: `${tag}-cmdB`, matchId: x.m.id });
});
