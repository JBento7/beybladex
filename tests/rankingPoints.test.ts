// "Pontuação dobrada" (lib/rankingPoints): base × multiplier, never compounded,
// eligibility preserved, only official events can turn it on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { RANKING_POINTS_BY_PLACE, placementRankingPoints, rankingMultiplier, resolveDoubleRankingPoints } from "../src/lib/rankingPoints.ts";

test("common event keeps the current points; doubled event awards exactly twice", () => {
  const normal = RANKING_POINTS_BY_PLACE.map((_, i) => placementRankingPoints(i, 1));
  assert.deepEqual(normal, [100, 70, 50, 30, 10]);
  const doubled = RANKING_POINTS_BY_PLACE.map((_, i) => placementRankingPoints(i, 2));
  assert.deepEqual(doubled, [200, 140, 100, 60, 20]);
});

test("placements without points stay at zero (6th+, not eligible)", () => {
  assert.equal(placementRankingPoints(5, 2), 0);
  assert.equal(placementRankingPoints(20, 2), 0);
  assert.equal(placementRankingPoints(0, 2, false), 0); // e.g. didn't reach the knockout
});

test("multiplier: 2 only for a flagged official event (or its test copy)", () => {
  assert.equal(rankingMultiplier({ isOfficial: true, doubleRankingPoints: false }), 1);
  assert.equal(rankingMultiplier({ isOfficial: true, doubleRankingPoints: true }), 2);
  assert.equal(rankingMultiplier({ isOfficial: false, isTest: true, doubleRankingPoints: true }), 2);
  assert.equal(rankingMultiplier({ isOfficial: false, doubleRankingPoints: true }), 1); // stale flag on a BeyEncontro
  // Recomputing always starts from the base table → applying it twice gives the same result.
  const once = placementRankingPoints(0, rankingMultiplier({ isOfficial: true, doubleRankingPoints: true }));
  const again = placementRankingPoints(0, rankingMultiplier({ isOfficial: true, doubleRankingPoints: true }));
  assert.equal(once, 200);
  assert.equal(again, 200);
});

test("server rule: admins only, official only; absent field keeps the stored value", () => {
  const official = { isOfficial: true, isTest: false };
  const casual = { isOfficial: false, isTest: false };
  assert.deepEqual(resolveDoubleRankingPoints({ requested: true, isAdmin: true, event: official }), { ok: true, value: true });
  assert.equal(resolveDoubleRankingPoints({ requested: true, isAdmin: true, event: casual }).ok, false);
  assert.equal(resolveDoubleRankingPoints({ requested: true, isAdmin: true, event: { isOfficial: false, isTest: true } }).ok, false);
  const notAdmin = resolveDoubleRankingPoints({ requested: true, isAdmin: false, event: official });
  assert.ok(!notAdmin.ok && notAdmin.status === 403);
  assert.equal(resolveDoubleRankingPoints({ requested: "yes", isAdmin: true, event: official }).ok, false);
  assert.deepEqual(resolveDoubleRankingPoints({ requested: undefined, isAdmin: false, event: official, current: true }), { ok: true, value: true });
  assert.deepEqual(resolveDoubleRankingPoints({ requested: undefined, isAdmin: true, event: casual, current: true }), { ok: true, value: false }); // became a BeyEncontro
  assert.deepEqual(resolveDoubleRankingPoints({ requested: false, isAdmin: false, event: official, current: true }), { ok: true, value: false });
  assert.deepEqual(resolveDoubleRankingPoints({ requested: true, isAdmin: true, event: { isOfficial: false, isTest: true }, current: true }), { ok: true, value: true }); // test copy keeps it
});
