// Judging mode (lib/displayMode): which matches need a deck order, what is
// broadcast, legacy rows, and when the mode can still change.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  battlePosition, broadcasts, displayModeLock, effectiveDisplayMode, missingDeckOrders, missingOrderMessage,
  parseDisplayMode, requiresDeckOrder, requiresTrioToStart,
} from "../src/lib/displayMode.ts";

test("legacy rows behave as ARENA; only the two modes parse", () => {
  assert.equal(effectiveDisplayMode(undefined), "ARENA");
  assert.equal(effectiveDisplayMode(null), "ARENA");
  assert.equal(effectiveDisplayMode("qualquer"), "ARENA");
  assert.equal(effectiveDisplayMode("JUDGE_ONLY"), "JUDGE_ONLY");
  assert.equal(parseDisplayMode("ARENA"), "ARENA");
  assert.equal(parseDisplayMode("JUDGE_ONLY"), "JUDGE_ONLY");
  assert.equal(parseDisplayMode(""), null, "an explicit choice is required");
  assert.equal(parseDisplayMode(undefined), null);
  assert.equal(broadcasts(undefined), true);
  assert.equal(broadcasts("JUDGE_ONLY"), false);
});

test("central rule: order only for ARENA + ordered deck; never SOLO; never judge-only", () => {
  assert.equal(requiresDeckOrder("ARENA", "THREE_ON_THREE"), true);
  assert.equal(requiresDeckOrder("ARENA", "THREE_ON_THREE_PLUS_ONE"), true);
  assert.equal(requiresDeckOrder("ARENA", "SOLO"), false, "SOLO has no order");
  assert.equal(requiresDeckOrder(undefined, "THREE_ON_THREE"), true, "old events keep requiring it");
  for (const d of ["SOLO", "THREE_ON_THREE", "THREE_ON_THREE_PLUS_ONE"]) assert.equal(requiresDeckOrder("JUDGE_ONLY", d), false);
  assert.equal(requiresTrioToStart("ARENA", "THREE_ON_THREE_PLUS_ONE"), true);
  assert.equal(requiresTrioToStart("JUDGE_ONLY", "THREE_ON_THREE_PLUS_ONE"), false, "trio declaration is optional without the telão");
  assert.equal(requiresTrioToStart("ARENA", "THREE_ON_THREE"), false);
});

test("battle position: set, battle and 3-battle cycle from stored sets", () => {
  assert.deepEqual(battlePosition([]), { setNumber: 1, battle: 0, cycleIndex: 0 });
  assert.deepEqual(battlePosition([{ setNumber: 1, status: "IN_PROGRESS", points: 2 }]), { setNumber: 1, battle: 2, cycleIndex: 0 });
  assert.deepEqual(battlePosition([{ setNumber: 1, status: "IN_PROGRESS", points: 3 }]), { setNumber: 1, battle: 3, cycleIndex: 1 }, "new cycle");
  assert.deepEqual(battlePosition([{ setNumber: 1, status: "FINISHED", points: 4 }]), { setNumber: 2, battle: 0, cycleIndex: 0 }, "new set");
});

test("missing orders: per set and cycle, only players with a complete deck, never byes or judge-only", () => {
  const players = [{ userId: "a", deckSize: 3 }, { userId: "b", deckSize: 3 }];
  const base = { mode: "ARENA", deckType: "THREE_ON_THREE", bye: false, setNumber: 1, cycleIndex: 0, players };
  assert.deepEqual(missingDeckOrders({ ...base, orders: [] }), ["a", "b"]);
  assert.deepEqual(missingDeckOrders({ ...base, orders: [{ userId: "a", setNumber: 1, cycleIndex: 0 }] }), ["b"]);
  // An order for set 1 doesn't cover set 2 or cycle 2.
  assert.deepEqual(missingDeckOrders({ ...base, setNumber: 2, orders: [{ userId: "a", setNumber: 1, cycleIndex: 0 }, { userId: "b", setNumber: 1, cycleIndex: 0 }] }), ["a", "b"]);
  assert.deepEqual(missingDeckOrders({ ...base, cycleIndex: 1, orders: [{ userId: "a", setNumber: 1, cycleIndex: 0 }] }), ["a", "b"]);
  assert.deepEqual(missingDeckOrders({ ...base, players: [{ userId: "a", deckSize: 1 }, { userId: "b", deckSize: 3 }], orders: [] }), ["b"], "incomplete deck is never blocked by an impossible order");
  assert.deepEqual(missingDeckOrders({ ...base, bye: true, orders: [] }), []);
  assert.deepEqual(missingDeckOrders({ ...base, mode: "JUDGE_ONLY", orders: [] }), [], "judge-only: no order in any set/cycle");
  assert.deepEqual(missingDeckOrders({ ...base, mode: "JUDGE_ONLY", setNumber: 3, cycleIndex: 2, orders: [] }), []);
  assert.deepEqual(missingDeckOrders({ ...base, deckType: "SOLO", orders: [] }), []);
});

test("messages and mode lock", () => {
  assert.match(missingOrderMessage(["Ana"]), /Ana precisa definir/);
  assert.match(missingOrderMessage(["Ana", "Rui"]), /Ana e Rui precisam/);
  assert.equal(displayModeLock({ status: "IN_PROGRESS", battlesStarted: false }), null);
  assert.equal(displayModeLock({ status: "REGISTRATION", battlesStarted: false }), null);
  assert.match(displayModeLock({ status: "IN_PROGRESS", battlesStarted: true })!, /já começaram/);
  assert.match(displayModeLock({ status: "FINISHED", battlesStarted: false })!, /encerrado/);
});
