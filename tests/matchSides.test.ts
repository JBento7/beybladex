// Sides of the players (lib/matchSides): B/X per set, swaps between sets,
// judge mirror, late choice in an older match, when changes are allowed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bSidePlayerInSet, judgeLeftPlayerId, leftPlayerId, sideOfPlayer, sidesEditable, sidesSwappedAt, xSideForBInSet } from "../src/lib/matchSides.ts";

const base = { player1Id: "ana", player2Id: "bia", maxSets: 3 };

test("either player can start on the B side; sides swap every set; the judge sees the mirror", () => {
  for (const [b, x] of [["ana", "bia"], ["bia", "ana"]]) {
    const m = { ...base, xSidePlayerId: xSideForBInSet(base, b, 1) };
    assert.equal(m.xSidePlayerId, x);
    assert.equal(bSidePlayerInSet(m, 1), b, "B side in set 1 = the chosen player");
    assert.equal(sideOfPlayer(m, b, 1), "B");
    assert.equal(sideOfPlayer(m, x, 1), "X");
    assert.equal(bSidePlayerInSet(m, 2), x, "set 2: swapped");
    assert.equal(sideOfPlayer(m, b, 2), "X");
    assert.equal(bSidePlayerInSet(m, 3), b, "set 3: back");
    assert.equal(leftPlayerId(m, 1), b, "telão left = B side");
    assert.equal(judgeLeftPlayerId(m, 1), x, "judge left = X side (mirror)");
    assert.equal(judgeLeftPlayerId(m, 2), b);
    assert.equal(sidesSwappedAt(m, 1), false);
    assert.equal(sidesSwappedAt(m, 2), true);
  }
});

test("single-set matches never swap; no sides → player 1 on the judge's left, no labels", () => {
  const m = { ...base, maxSets: 1, xSidePlayerId: "bia" };
  assert.equal(bSidePlayerInSet(m, 1), "ana");
  assert.equal(sidesSwappedAt(m, 1), false);
  const none = { ...base, xSidePlayerId: null };
  assert.equal(judgeLeftPlayerId(none, 2), "ana");
  assert.equal(sideOfPlayer(none, "ana", 1), null);
});

test("late choice (older match without sides): applies from the current set, as the judge saw it", () => {
  for (const set of [1, 2, 3]) for (const b of ["ana", "bia"]) {
    const m = { ...base, xSidePlayerId: xSideForBInSet(base, b, set) };
    assert.equal(bSidePlayerInSet(m, set), b, `set ${set}: ${b} on the B side`);
  }
});

test("when the sides may change", () => {
  assert.deepEqual(sidesEditable({ status: "PENDING", battlesPlayed: 0, xSidePlayerId: null }), { ok: true, firstTime: true });
  assert.deepEqual(sidesEditable({ status: "PENDING", battlesPlayed: 0, xSidePlayerId: "ana" }), { ok: true, firstTime: false }, "correct before the first battle");
  assert.deepEqual(sidesEditable({ status: "IN_PROGRESS", battlesPlayed: 3, xSidePlayerId: null }), { ok: true, firstTime: true }, "older match: once");
  assert.equal(sidesEditable({ status: "IN_PROGRESS", battlesPlayed: 3, xSidePlayerId: "ana" }).ok, false);
  assert.equal(sidesEditable({ status: "FINISHED", battlesPlayed: 0, xSidePlayerId: null }).ok, false);
});
