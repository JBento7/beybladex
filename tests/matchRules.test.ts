// Match rules per phase (lib/matchRules): Swiss and knockout are independent,
// validated against the form's options, knockout falls back to the main rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hasKnockoutPhase, knockoutRules, parseMatchRules, setsLabel } from "../src/lib/matchRules.ts";

test("Swiss with cut: each phase keeps its own values", () => {
  const r = parseMatchRules({ format: "ROUND_ROBIN", setsToWin: "1", pointsToWinSet: "4", day2SetsToWin: "2", day2PointsToWinSet: "5" });
  assert.deepEqual(r, { ok: true, setsToWin: 1, pointsToWinSet: 4, knockoutSets: 2, knockoutPoints: 5 });
  const other = parseMatchRules({ format: "ROUND_ROBIN", setsToWin: 2, pointsToWinSet: 7, day2SetsToWin: 2, day2PointsToWinSet: 5 });
  assert.ok(other.ok && other.knockoutSets === 2 && other.knockoutPoints === 5); // Swiss change doesn't touch knockout
});

test("formats without two phases have no knockout rules", () => {
  for (const format of ["SINGLE_ELIMINATION", "GROUPS"]) {
    const r = parseMatchRules({ format, setsToWin: "2", pointsToWinSet: "5", day2SetsToWin: "1", day2PointsToWinSet: "7" });
    assert.deepEqual(r, { ok: true, setsToWin: 2, pointsToWinSet: 5, knockoutSets: null, knockoutPoints: null });
  }
  assert.equal(hasKnockoutPhase("SWISS"), true);
  assert.equal(hasKnockoutPhase("SINGLE_ELIMINATION"), false);
});

test("values outside the allowed options are refused; missing ones use the defaults", () => {
  for (const bad of [{ setsToWin: "3" }, { pointsToWinSet: "8" }, { day2SetsToWin: "0" }, { day2PointsToWinSet: "3" }, { day2PointsToWinSet: "x" }, { setsToWin: 1.5 }]) {
    const r = parseMatchRules({ format: "ROUND_ROBIN", ...bad });
    assert.equal(r.ok, false, JSON.stringify(bad));
  }
  assert.deepEqual(parseMatchRules({ format: "ROUND_ROBIN" }), { ok: true, setsToWin: 2, pointsToWinSet: 4, knockoutSets: null, knockoutPoints: null });
  const keep = parseMatchRules({ format: "ROUND_ROBIN", day2SetsToWin: "" }, { setsToWin: 1, pointsToWinSet: 6, knockoutSets: 2, knockoutPoints: 5 });
  assert.deepEqual(keep, { ok: true, setsToWin: 1, pointsToWinSet: 6, knockoutSets: 2, knockoutPoints: 5 });
});

test("knockout rules fall back to the main ones on old events; labels", () => {
  assert.deepEqual(knockoutRules({ setsToWin: 1, pointsToWinSet: 4, day2SetsToWin: null, day2PointsToWinSet: null }), { setsToWin: 1, pointsToWinSet: 4 });
  assert.deepEqual(knockoutRules({ setsToWin: 1, pointsToWinSet: 4, day2SetsToWin: 2, day2PointsToWinSet: 5 }), { setsToWin: 2, pointsToWinSet: 5 });
  assert.deepEqual(knockoutRules({ setsToWin: 1, pointsToWinSet: 4, day2SetsToWin: 2, day2PointsToWinSet: null }), { setsToWin: 2, pointsToWinSet: 4 });
  assert.equal(setsLabel(1), "set único");
  assert.equal(setsLabel(2), "melhor de 3 sets");
});
