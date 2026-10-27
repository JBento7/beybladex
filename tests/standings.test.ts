// Regression tests for the Swiss standings / final placement math.
// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeSwissStandings,
  computeSwissFinalPlacement,
  decidedPodium,
  type StandingsMatch,
} from "../src/lib/standings.ts";

const F = "FINISHED";
// Helper: a played match, winner scores 4 battle points, loser `loserPts`.
const m = (round: number, a: string, b: string, winner: string, loserPts = 0, extra: Partial<StandingsMatch> = {}): StandingsMatch => ({
  round, status: F, player1Id: a, player2Id: b, winnerId: winner,
  points: [
    { userId: winner, points: 4 },
    ...(loserPts ? [{ userId: winner === a ? b : a, points: loserPts }] : []),
  ],
  ...extra,
});
const bye = (round: number, p: string): StandingsMatch => ({ round, status: F, player1Id: p, player2Id: p, winnerId: p, isWalkover: true });

// 8 players, 4 Swiss rounds (a 3-round Swiss for 8 would be ceil(log2 8)=3; we
// use 4 to mirror the reported event), then a top-4 knockout in rounds 5-6.
const P = ["A", "B", "C", "D", "E", "F", "G", "H"];
const swiss: StandingsMatch[] = [
  m(1, "A", "B", "A"), m(1, "C", "D", "C"), m(1, "E", "F", "E"), m(1, "G", "H", "G"),
  m(2, "A", "C", "A"), m(2, "E", "G", "E"), m(2, "B", "D", "B"), m(2, "F", "H", "F"),
  m(3, "A", "E", "A"), m(3, "C", "G", "C"), m(3, "B", "F", "B"), m(3, "D", "H", "D"),
  m(4, "A", "B", "A", 3), m(4, "E", "C", "E"), m(4, "G", "F", "G"), m(4, "D", "H", "D"),
];
const knockout: StandingsMatch[] = [
  m(5, "A", "D", "A"), m(5, "E", "C", "C"),          // semifinals
  m(6, "A", "C", "A"),                                 // final
  m(6, "E", "D", "E", 0, { isThirdPlace: true }),      // 3rd place
];

test("knockout wins never change the Swiss standings", () => {
  const before = computeSwissStandings(P, swiss, 4);
  const after = computeSwissStandings(P, [...swiss, ...knockout], 4);
  assert.deepEqual(after, before);
  const a = after.find((r) => r.userId === "A")!;
  assert.equal(a.swissPoints, 4); // 4 Swiss rounds → never 5 (the reported bug)
  assert.equal(a.wins, 4);
  assert.ok(after.every((r) => r.swissPoints <= 4));
});

test("final placement follows the knockout, Swiss decides the rest", () => {
  const all = [...swiss, ...knockout];
  const placement = computeSwissFinalPlacement(P, all, 4);
  assert.deepEqual(placement.slice(0, 4).map((p) => p.userId), ["A", "C", "E", "D"]);
  assert.ok(placement.slice(0, 4).every((p) => p.basis === "knockout" && p.qualified));
  // Non-qualifiers are ordered by their Swiss standing.
  const swissOrder = computeSwissStandings(P, all, 4).map((r) => r.userId).filter((id) => !["A", "C", "E", "D"].includes(id));
  assert.deepEqual(placement.slice(4).map((p) => p.userId), swissOrder);
  assert.deepEqual(decidedPodium(all, 4), { first: "A", second: "C", third: "E" });
});

test("byes give 1 Swiss point but are not played wins", () => {
  const players = ["A", "B", "C"];
  const matches = [m(1, "A", "B", "A"), bye(1, "C"), m(2, "A", "C", "C"), bye(2, "B")];
  const rows = computeSwissStandings(players, matches, 2);
  const c = rows.find((r) => r.userId === "C")!;
  assert.equal(c.byes, 1);
  assert.equal(c.wins, 1);
  assert.equal(c.swissPoints, 2);
  assert.equal(c.played, 1);
  // Knockout padding byes (no isWalkover) are not Swiss byes.
  const padded = computeSwissStandings(players, [...matches, { round: 3, status: F, player1Id: "A", player2Id: "A", winnerId: "A" }], 3);
  assert.equal(padded.find((r) => r.userId === "A")!.byes, 0);
});

test("ties on Swiss points break on battle points, then balance, then input order", () => {
  // B and C both 1 win. B scored more battle points.
  const rows = computeSwissStandings(["A", "B", "C", "D"], [
    m(1, "A", "B", "A", 3), m(1, "C", "D", "C"),
    m(2, "B", "D", "B"), m(2, "A", "C", "A"),
  ], 2);
  assert.deepEqual(rows.map((r) => r.userId), ["A", "B", "C", "D"]);
  // Full tie (same points, same battle points, same balance): stable order.
  const tie = computeSwissStandings(["X", "Y"], [bye(1, "X"), bye(1, "Y")], 1);
  assert.deepEqual(tie.map((r) => r.userId), ["X", "Y"]);
});

test("no podium is invented for an unfinished bracket", () => {
  const unfinishedFinal = [...swiss, m(5, "A", "D", "A"), m(5, "E", "C", "C"), { round: 6, status: "PENDING", player1Id: "A", player2Id: "C", winnerId: null }];
  assert.deepEqual(decidedPodium(unfinishedFinal, 4), {});
  assert.deepEqual(decidedPodium(swiss, 4), {}); // pure Swiss so far, no knockout
  // Final played but the 3rd-place match isn't: no 3rd place yet.
  const noThird = [...swiss, ...knockout.slice(0, 3), { round: 6, status: "PENDING", player1Id: "E", player2Id: "D", winnerId: null, isThirdPlace: true }];
  assert.deepEqual(decidedPodium(noThird, 4), { first: "A", second: "C", third: undefined });
});

test("unfinished and third-place matches are ignored in the Swiss table", () => {
  const rows = computeSwissStandings(["A", "B"], [{ round: 1, status: "IN_PROGRESS", player1Id: "A", player2Id: "B", winnerId: null }], 1);
  assert.ok(rows.every((r) => r.played === 0 && r.swissPoints === 0));
});
