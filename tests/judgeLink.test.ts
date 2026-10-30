// Judge ↔ telão protocol rules (lib/judgeLink), pending launch store
// (lib/pendingLaunch) and labels (lib/matchLabel).
import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptState, createCommandGate, linkStatus, serverStatus } from "../src/lib/judgeLink.ts";
import { clearPending, loadPending, pendingKey, savePending, type PendingLaunch } from "../src/lib/pendingLaunch.ts";
import { judgeHeader, launchText, matchPhaseLabel, setLabel } from "../src/lib/matchLabel.ts";

test("command gate: each command once, never for another match", () => {
  const g = createCommandGate(3);
  assert.equal(g.decide({ commandId: "c1", matchId: "m1" }, "m1"), "run");
  assert.equal(g.decide({ commandId: "c1", matchId: "m1" }, "m1"), "duplicate"); // local link + server poll
  assert.equal(g.decide({ commandId: "c2", matchId: "m2" }, "m1"), "other_match");
  assert.equal(g.decide({ commandId: "c3", matchId: "m1" }, null), "run"); // idle telão
  // A recount is a NEW command id → runs again.
  assert.equal(g.decide({ commandId: "c4", matchId: "m1" }, "m1"), "run");
});

test("states: same match only, never older than the one on screen", () => {
  assert.equal(acceptState({ matchId: "m1", version: 5 }, { matchId: "m1", version: 6 }), true);
  assert.equal(acceptState({ matchId: "m1", version: 5 }, { matchId: "m1", version: 5 }), true);
  assert.equal(acceptState({ matchId: "m1", version: 5 }, { matchId: "m1", version: 4 }), false);
  assert.equal(acceptState({ matchId: "m1", version: 5 }, { matchId: "m2", version: 9 }), false);
  assert.equal(acceptState(null, { matchId: "m1", version: 1 }), false);
});

test("connection indicators", () => {
  assert.equal(linkStatus(null, 1000), "unconfirmed");
  assert.equal(linkStatus(1000, 5000), "connected");
  assert.equal(linkStatus(1000, 20000), "unconfirmed");
  assert.equal(serverStatus(9000, null, 10000), "connected");
  assert.equal(serverStatus(9000, 9500, 10000), "reconnecting");
  assert.equal(serverStatus(0, 1000, 30000), "offline");
});

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), raw: m };
}
const p: PendingLaunch = { actionId: "a1", matchId: "m1", scorerId: "u1", scorerName: "João", finishType: "BURST_FINISH", points: 2, beybladeId: null, setNumber: 1, battle: 2, createdAt: 1000 };

test("pending launch survives a reload and keeps only whitelisted fields", () => {
  const s = memStore();
  assert.equal(savePending(s, { ...p, token: "secret", cookie: "x" } as PendingLaunch), true);
  const raw = s.raw.get(pendingKey("m1"))!;
  assert.ok(!raw.includes("secret") && !raw.includes("cookie"));
  assert.deepEqual(loadPending(s, "m1", 2000), p);
  assert.equal(loadPending(s, "m2", 2000), null);
  // Clearing with another action id keeps the current one.
  clearPending(s, "m1", "other");
  assert.ok(loadPending(s, "m1", 2000));
  clearPending(s, "m1", "a1");
  assert.equal(loadPending(s, "m1", 2000), null);
});

test("pending launch: corrupt or very old entries are dropped", () => {
  const s = memStore();
  s.setItem(pendingKey("m1"), "{not json");
  assert.equal(loadPending(s, "m1"), null);
  savePending(s, p);
  assert.equal(loadPending(s, "m1", 1000 + 25 * 3600_000), null);
  assert.equal(loadPending(null, "m1"), null);
});

test("labels: phase, set, header and last launch", () => {
  assert.equal(matchPhaseLabel({ format: "ROUND_ROBIN", round: 3, swissRounds: 4 }), "Suíço — Rodada 3");
  assert.equal(matchPhaseLabel({ format: "ROUND_ROBIN", round: 5, swissRounds: 4, roundSize: 2 }), "Semifinal");
  assert.equal(matchPhaseLabel({ format: "ROUND_ROBIN", round: 6, swissRounds: 4, roundSize: 1 }), "Final");
  assert.equal(matchPhaseLabel({ format: "ROUND_ROBIN", round: 6, swissRounds: 4, isThirdPlace: true, roundSize: 1 }), "Disputa de 3º lugar");
  assert.equal(matchPhaseLabel({ format: "SINGLE_ELIMINATION", round: 1, roundSize: 4 }), "Quartas de final");
  assert.equal(setLabel(1, 2), "Set 1 de até 3");
  assert.equal(setLabel(1, 1), "Set único");
  assert.equal(judgeHeader({ arena: 2, phase: "Suíço — Rodada 3", setNumber: 1, setsToWin: 2 }), "Arena 2 · Suíço — Rodada 3 · Set 1 de até 3");
  assert.equal(launchText({ playerName: "João", finishType: "BURST_FINISH", points: 2, setNumber: 1 }), "João · Burst Finish · +2 · Set 1");
});
