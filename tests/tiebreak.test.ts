// Swiss tiebreak rules and saved-vs-recalculated placement.
// Order: Swiss points → battle points → balance → nickname (A→Z) → id.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeSwissStandings,
  computeSwissFinalPlacement,
  comparePlacements,
  type StandingsMatch,
} from "../src/lib/standings.ts";

const F = "FINISHED";
const pts = (a: string, pa: number, b: string, pb: number) => [{ userId: a, points: pa }, { userId: b, points: pb }].filter((p) => p.points > 0);
const m = (round: number, a: string, b: string, winner: string, pa: number, pb: number, extra: Partial<StandingsMatch> = {}): StandingsMatch =>
  ({ round, status: F, player1Id: a, player2Id: b, winnerId: winner, points: pts(a, pa, b, pb), ...extra });
const names = { a: "Ômega Destroyer", b: "O Artesão", c: "Zé", d: "Ana", e: "Bia", f: "Caio" };

test("tie on wins broken by battle points, then balance", () => {
  // x beats z 4-0; y beats w 4-3; z beats y 4-2; w beats x 4-2  → every one 1–1.
  const ms = [m(1, "x", "z", "x", 4, 0), m(1, "y", "w", "y", 4, 3), m(2, "z", "y", "z", 4, 2), m(2, "w", "x", "w", 4, 2)];
  const rows = computeSwissStandings(["w", "x", "y", "z"], ms, 2, { w: "W", x: "X", y: "Y", z: "Z" });
  // battle points: w 7, x 6, y 6, z 4 → w first, z last; x/y tie on 6 → balance: x 6-4=+2, y 6-8=-2.
  assert.deepEqual(rows.map((r) => r.userId), ["w", "x", "y", "z"]);
  assert.ok(rows.every((r) => r.swissPoints === 1));
});

test("tie on points and battle points broken by balance", () => {
  // p and q both 1 win, 5 battle points; p conceded 1, q conceded 3.
  const ms = [m(1, "p", "r", "p", 4, 1), m(1, "q", "s", "q", 4, 3), m(2, "p", "s", "s", 1, 4), m(2, "q", "r", "r", 1, 4)];
  const rows = computeSwissStandings(["q", "p", "r", "s"], ms, 2, {});
  const p = rows.find((r) => r.userId === "p")!, q = rows.find((r) => r.userId === "q")!;
  assert.equal(p.battlePoints, q.battlePoints);
  assert.equal(p.swissPoints, q.swissPoints);
  assert.ok(p.balance > q.balance);
  assert.ok(rows.indexOf(p) < rows.indexOf(q));
});

test("complete tie → alphabetical nickname, regardless of input order", () => {
  // The reported case: Ômega Destroyer vs O Artesão, identical Swiss record.
  const ms = [m(1, "a", "c", "a", 4, 0), m(1, "b", "d", "b", 4, 0)];
  const one = computeSwissStandings(["a", "b", "c", "d"], ms, 1, names).map((r) => r.userId);
  const two = computeSwissStandings(["d", "c", "b", "a"], ms, 1, names).map((r) => r.userId);
  assert.deepEqual(one, two); // deterministic
  // "O Artesão" < "Ômega Destroyer" in pt-BR (accent-insensitive: "O A..." before "O m...").
  assert.deepEqual(one.slice(0, 2), ["b", "a"]);
  // Losers: Ana before Zé.
  assert.deepEqual(one.slice(2), ["d", "c"]);
});

test("Swiss + knockout: non-qualifiers follow the same Swiss order as the table", () => {
  const ms = [
    m(1, "a", "b", "a", 4, 0), m(1, "c", "d", "c", 4, 0), m(1, "e", "f", "e", 4, 0),
    m(2, "a", "c", "a", 4, 0), m(2, "b", "d", "b", 4, 0), m(2, "e", "f", "f", 0, 4),
    // knockout top 2 in round 3
    m(3, "a", "c", "c", 0, 4),
  ];
  const ids = ["a", "b", "c", "d", "e", "f"];
  const table = computeSwissStandings(ids, ms, 2, names).map((r) => r.userId);
  const final = computeSwissFinalPlacement(ids, ms, 2, names).map((p) => p.userId);
  assert.deepEqual(final.slice(0, 2), ["c", "a"]); // knockout decides the top
  assert.deepEqual(final.slice(2), table.filter((id) => id !== "a" && id !== "c")); // rest = Swiss table order
});

test("saved placement differing on a complete tie is reported as 'empate', not rewritten", () => {
  const ms = [m(1, "a", "c", "a", 4, 0), m(1, "b", "d", "b", 4, 0)];
  const ids = ["a", "b", "c", "d"];
  const swiss = computeSwissStandings(ids, ms, 1, names);
  const recalculated = computeSwissFinalPlacement(ids, ms, 1, names);
  // Historical result saved at closing: Ômega 1st, Artesão 2nd (old, undefined tiebreak).
  const stored = [{ userId: "a", placement: 1 }, { userId: "b", placement: 2 }, { userId: "d", placement: 3 }, { userId: "c", placement: 4 }];
  const diff = comparePlacements(stored, recalculated, swiss);
  assert.deepEqual(diff.map((d) => [d.userId, d.storedPlace, d.recalculatedPlace, d.reason]), [["a", 1, 2, "empate"], ["b", 2, 1, "empate"]]);
  // Stored data untouched by the comparison.
  assert.equal(stored[0].placement, 1);
  // When a result changed after closing, the reason is "resultado".
  const changed = [m(1, "a", "c", "a", 4, 0), m(1, "b", "d", "d", 0, 4)];
  const diff2 = comparePlacements(stored, computeSwissFinalPlacement(ids, changed, 1, names), computeSwissStandings(ids, changed, 1, names));
  assert.ok(diff2.some((d) => d.reason === "resultado"));
});
