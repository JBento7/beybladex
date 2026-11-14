// Reduel rules (lib/reduelRules): when a launch can be repeated, and which
// points belong to an annulled attempt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { attemptKey, decideReduel, parseReduelRequest, pointAttemptOk } from "../src/lib/reduelRules.ts";
import { activeMs, canPauseRecorder, clipLabel } from "../src/lib/replayCore.ts";
import { createCommandGate } from "../src/lib/judgeLink.ts";

const base = { status: "IN_PROGRESS", bye: false, position: { setNumber: 1, battle: 2 }, reduelsSoFar: 0 };

test("allowed only for the battle under way with no confirmed point", () => {
  assert.deepEqual(decideReduel({ ...base, request: { setNumber: 1, battle: 2, attempt: 0 } }), { ok: true, annulledAttempt: 1 });
  assert.deepEqual(decideReduel({ ...base, reduelsSoFar: 1, request: { setNumber: 1, battle: 2, attempt: 1 } }), { ok: true, annulledAttempt: 2 });
  const scored = decideReduel({ ...base, position: { setNumber: 1, battle: 3 }, request: { setNumber: 1, battle: 2, attempt: 0 } });
  assert.ok(!scored.ok && scored.code === "BATTLE_SCORED" && /Desfazer último lançamento/.test(scored.error) && /Nenhum ponto foi removido/.test(scored.error));
  const nextSet = decideReduel({ ...base, position: { setNumber: 2, battle: 0 }, request: { setNumber: 1, battle: 2 } });
  assert.ok(!nextSet.ok && nextSet.code === "BATTLE_SCORED", "the set closed with that point");
  const stale = decideReduel({ ...base, reduelsSoFar: 1, request: { setNumber: 1, battle: 2, attempt: 0 } });
  assert.ok(!stale.ok && stale.code === "REDUEL_STALE", "two operators: only one Reduel per attempt");
  assert.ok(!decideReduel({ ...base, status: "FINISHED", request: { setNumber: 1, battle: 2 } }).ok);
  assert.ok(!decideReduel({ ...base, bye: true, request: { setNumber: 1, battle: 2 } }).ok);
});

test("request parsing, attempt keys and points of an annulled attempt", () => {
  assert.equal(parseReduelRequest({ opId: "x", setNumber: 1, battle: 0 }), null, "short op id");
  assert.deepEqual(parseReduelRequest({ opId: "abcdefgh-1", setNumber: 1, battle: 0, attempt: 2 }), { opId: "abcdefgh-1", setNumber: 1, battle: 0, attempt: 2 });
  assert.equal(parseReduelRequest({ opId: "abcdefgh-1", setNumber: 0, battle: 0 }), null);
  assert.notEqual(attemptKey(1, 2, 0), attemptKey(1, 2, 1), "a Reduel makes the same battle a new start");
  assert.equal(pointAttemptOk(0, 0), true);
  assert.equal(pointAttemptOk(0, 1), false, "point tapped before the Reduel");
  assert.equal(pointAttemptOk(undefined, 3), true, "older panels without attempt");
});

test("recorder pause support, active time and labels", () => {
  assert.equal(canPauseRecorder({ pause() {}, resume() {} }), true);
  assert.equal(canPauseRecorder({}), false, "no native pause → close and continue in a new take");
  assert.equal(activeMs({ startedAt: 0, pausedTotal: 2000, pausedAt: null }, 10_000), 8000);
  assert.equal(activeMs({ startedAt: 0, pausedTotal: 0, pausedAt: 6000 }, 10_000), 6000, "paused time doesn't count");
  assert.equal(clipLabel({ setNumber: 1, battle: 2, take: 1, attempt: 1, voided: true }), "Set 1 · Batalha 2 · Tentativa anulada — Reduel");
  assert.equal(clipLabel({ setNumber: 1, battle: 2, take: 3, attempt: 2 }), "Set 1 · Batalha 2 · tentativa 2 (tomada 3)");
});

test("telão: commands of an annulled attempt never run late", () => {
  const g = createCommandGate();
  g.voidIds(["cd-old", null]);
  assert.equal(g.decide({ commandId: "cd-old", matchId: "m" }, "m"), "duplicate");
  assert.equal(g.decide({ commandId: "reduel:op1", matchId: "m" }, "m"), "run");
  assert.equal(g.decide({ commandId: "reduel:op1", matchId: "m" }, "m"), "duplicate", "link + server copy run once");
});
