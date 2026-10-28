// Swiss core: pairing, bye, integrity, cut/seeding, scoring and repair.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pairSwissRound, auditSwiss, hasBlocking, validateCut, seededFirstRound, nextBracketRound,
  applyPoint, planRoundRepair, seededShuffle, isSwissFormat, type AuditMatch,
} from "../src/lib/swiss.ts";

const P = (id: string, points: number) => ({ id, points });
const ok = (r: ReturnType<typeof pairSwissRound>) => {
  assert.equal(r.status, "ok", r.status !== "ok" ? r.notes.join(" | ") : "");
  return r as Extract<typeof r, { status: "ok" }>;
};
const pairKey = (a: string, b: string) => [a, b].sort().join("×");
const everyoneOnce = (r: { pairs: { player1Id: string; player2Id: string }[]; byeId: string | null }, ids: string[]) => {
  const seen = [...r.pairs.flatMap((p) => [p.player1Id, p.player2Id]), ...(r.byeId ? [r.byeId] : [])].sort();
  assert.deepEqual(seen, [...ids].sort()); // nobody omitted, nobody duplicated
};

// ── Pairing ──
test("regression A–F: keeps score groups when a rematch-free solution exists", () => {
  const r = ok(pairSwissRound({
    players: [P("A", 2), P("B", 2), P("C", 2), P("D", 2), P("E", 1), P("F", 1)],
    opponents: { C: ["D"], D: ["C"] },
    round: 3,
  }));
  const got = r.pairs.map((p) => pairKey(p.player1Id, p.player2Id)).sort();
  assert.deepEqual(got, ["A×C", "B×D", "E×F"]);
  assert.equal(r.crossings.length, 0);
  assert.ok(!got.includes("A×B"));
});

test("even field: everyone paired exactly once, no rematches", () => {
  const players = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id, i) => P(id, i < 4 ? 1 : 0));
  const r = ok(pairSwissRound({ players, opponents: { a: ["e"], e: ["a"], b: ["f"], f: ["b"] }, round: 2 }));
  everyoneOnce(r, players.map((p) => p.id));
  assert.equal(r.byeId, null);
  assert.equal(r.rematches.length, 0);
});

test("odd field: exactly one bye, never a player who already had one when avoidable", () => {
  const players = ["a", "b", "c", "d", "e"].map((id, i) => P(id, 2 - Math.floor(i / 2)));
  const r = ok(pairSwissRound({ players, opponents: {}, byeCounts: { e: 1 }, round: 3 }));
  everyoneOnce(r, players.map((p) => p.id));
  assert.equal(r.byeId, "d"); // lowest standing WITHOUT a previous bye
});

test("bye skips a candidate whose removal makes the rest unpairable", () => {
  // e is last but if e sits out, a must play b or c... both faced → choose next candidate.
  const players = [P("a", 1), P("b", 1), P("c", 1), P("d", 0), P("e", 0)];
  const opp = { a: ["b", "c", "d"], b: ["a"], c: ["a"], d: ["a"] };
  const r = ok(pairSwissRound({ players, opponents: opp, round: 2 }));
  everyoneOnce(r, players.map((p) => p.id));
  assert.equal(r.rematches.length, 0);
  assert.notEqual(r.byeId, "e");
  assert.ok(r.notes.some((n) => n.includes("Bye não atribuído a e")));
});

test("no rematch-free round → 'impossible' (proven), nothing generated", () => {
  const r = pairSwissRound({ players: [P("a", 1), P("b", 1)], opponents: { a: ["b"], b: ["a"] }, round: 2 });
  assert.equal(r.status, "impossible");
  // With an explicit administrative exception the rematch is allowed and reported.
  const ex = ok(pairSwissRound({ players: [P("a", 1), P("b", 1)], opponents: { a: ["b"] }, round: 2, allowRematches: true }));
  assert.equal(ex.rematches.length, 1);
});

test("search budget exhausted is 'limit', never treated as impossible", () => {
  // 12 players, half the possible pairs forbidden in a pattern that needs search.
  const ids = Array.from({ length: 12 }, (_, i) => `p${i}`);
  const opp: Record<string, string[]> = {};
  for (const a of ids) opp[a] = ids.filter((b) => b !== a && (Number(a.slice(1)) + Number(b.slice(1))) % 2 === 1);
  const r = pairSwissRound({ players: ids.map((id) => P(id, 0)), opponents: opp, round: 2, nodeBudget: 3 });
  assert.equal(r.status, "limit");
  assert.ok(r.notes.some((n) => n.includes("não prova")));
});

test("round 1 is reproducible with the same seed and changes with another", () => {
  const players = ["a", "b", "c", "d", "e", "f", "g"].map((id) => P(id, 0));
  const one = ok(pairSwissRound({ players, opponents: {}, round: 1, seed: 42 }));
  const two = ok(pairSwissRound({ players: [...players].reverse(), opponents: {}, round: 1, seed: 42 }));
  assert.deepEqual(one.pairs, two.pairs);
  assert.equal(one.byeId, two.byeId);
  assert.equal(one.seed, 42);
  assert.notDeepEqual(seededShuffle(players, 1).map((p) => p.id), seededShuffle(players, 2).map((p) => p.id));
});

test("both stored Swiss formats use the same engine", () => {
  assert.ok(isSwissFormat("ROUND_ROBIN") && isSwissFormat("SWISS"));
  assert.ok(!isSwissFormat("GROUPS") && !isSwissFormat("SINGLE_ELIMINATION"));
});

// ── Integrity ──
const M = (id: string, round: number, a: string, b: string, winner: string | null, extra: Partial<AuditMatch> = {}): AuditMatch =>
  ({ id, round, status: winner ? "FINISHED" : "PENDING", player1Id: a, player2Id: b, winnerId: winner, ...extra });

test("player on two sides of different matches in the same round is blocking", () => {
  const issues = auditSwiss({ matches: [M("m1", 1, "a", "b", "a"), M("m2", 1, "c", "a", "c")], swissRounds: 2, participants: ["a", "b", "c"], tournamentStatus: "IN_PROGRESS" });
  const dup = issues.find((i) => i.code === "DUPLICATE_PARTICIPATION");
  assert.ok(dup && dup.userId === "a" && dup.matchIds.length === 2);
  assert.ok(hasBlocking(issues));
});

test("bye and a match for the same player in one round is blocking", () => {
  const issues = auditSwiss({ matches: [M("m1", 1, "a", "a", "a", { isWalkover: true }), M("m2", 1, "a", "b", "b")], swissRounds: 1, participants: ["a", "b"], tournamentStatus: "IN_PROGRESS" });
  assert.ok(issues.some((i) => i.code === "DUPLICATE_PARTICIPATION" && i.userId === "a"));
});

test("finished event with pending matches and a 6-wins-in-5-rounds history is flagged, not rewritten", () => {
  const matches = [
    M("r5a", 5, "s", "x", "s"), M("r5b", 5, "s", "y", "s"), // extra match in round 5 (the reported pattern)
    M("ko", 6, "s", "z", null),
  ];
  const issues = auditSwiss({ matches, swissRounds: 5, participants: ["s", "x", "y", "z"], tournamentStatus: "FINISHED", qualifiers: 4 });
  assert.ok(issues.some((i) => i.code === "DUPLICATE_PARTICIPATION" && i.userId === "s" && i.round === 5));
  assert.ok(issues.some((i) => i.code === "PENDING_IN_FINISHED"));
  assert.equal(matches.length, 3); // input untouched
});

test("schedule collisions are reported", () => {
  const issues = auditSwiss({ matches: [M("m1", 1, "a", "b", null, { arena: 1, slot: 0 }), M("m2", 1, "c", "d", null, { arena: 1, slot: 0 })], swissRounds: 1, participants: ["a", "b", "c", "d"], tournamentStatus: "IN_PROGRESS" });
  assert.ok(issues.some((i) => i.code === "SCHEDULE_COLLISION" && i.matchIds.length === 2));
});

// ── Cut & seeding ──
test("cut rules: none / partial / all / larger than field / unsupported", () => {
  assert.deepEqual(validateCut(null, 9), { mode: "none" });
  assert.deepEqual(validateCut(4, 9), { mode: "partial" });
  assert.deepEqual(validateCut(8, 9), { mode: "partial" });
  assert.deepEqual(validateCut(4, 4), { mode: "all" }); // 4 players, top 4 → semifinals, not an early finish
  assert.deepEqual(validateCut(8, 8), { mode: "all" });
  assert.equal(validateCut(8, 6).mode, "error");
  assert.equal(validateCut(6, 9).mode, "error");
});

test("seeding top 4 and top 8 follow the published brackets", () => {
  const s4 = seededFirstRound(["1", "2", "3", "4"]).map((p) => `${p.player1Id}x${p.player2Id}@${p.bracketPos}`);
  assert.deepEqual(s4, ["1x4@1", "2x3@2"]);
  const s8 = seededFirstRound(["1", "2", "3", "4", "5", "6", "7", "8"]).map((p) => `${p.player1Id}x${p.player2Id}`);
  assert.deepEqual(s8, ["1x8", "4x5", "2x7", "3x6"]);
});

test("bracket advance keeps positions and ignores query order", () => {
  const next = nextBracketRound([
    { bracketPos: 3, winnerId: "w3" }, { bracketPos: 1, winnerId: "w1" }, { bracketPos: 4, winnerId: "w4" }, { bracketPos: 2, winnerId: "w2" },
  ]);
  assert.deepEqual(next, [{ player1Id: "w1", player2Id: "w2", bracketPos: 1 }, { player1Id: "w3", player2Id: "w4", bracketPos: 2 }]);
  assert.equal(nextBracketRound([{ bracketPos: 1, winnerId: "a" }, { bracketPos: 2, winnerId: null }]), null);
});

// ── Scoring ──
const base = { player1Id: "a", player2Id: "b", matchStatus: "IN_PROGRESS", setsToWin: 2, pointsToWinSet: 4 };
test("a finish may overshoot the target and closes the set", () => {
  const r = applyPoint({ ...base, sets: [{ setNumber: 1, status: "IN_PROGRESS", player1Points: 3, player2Points: 0, winnerId: null }], scorerId: "a", points: 3 });
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.equal(r.player1Points, 6); // 3 + Xtreme 3, not capped at 4
  assert.equal(r.setWinnerId, "a");
  assert.equal(r.matchWinnerId, null);
});

test("match decided by sets even with fewer total battle points", () => {
  const sets = [
    { setNumber: 1, status: "FINISHED" as const, player1Points: 0, player2Points: 9, winnerId: "b" },
    { setNumber: 2, status: "FINISHED" as const, player1Points: 4, player2Points: 3, winnerId: "a" },
    { setNumber: 3, status: "IN_PROGRESS" as const, player1Points: 3, player2Points: 3, winnerId: null },
  ];
  const r = applyPoint({ ...base, sets, scorerId: "a", points: 1 });
  if ("error" in r) throw new Error(r.error);
  assert.equal(r.matchWinnerId, "a"); // 8 points vs 15, but 2 sets to 1
});

test("finished match / decided match / wrong scorer are rejected", () => {
  assert.ok("error" in applyPoint({ ...base, matchStatus: "FINISHED", sets: [], scorerId: "a", points: 1 }));
  assert.ok("error" in applyPoint({ ...base, sets: [], scorerId: "z", points: 1 }));
  const won = [1, 2].map((n) => ({ setNumber: n, status: "FINISHED" as const, player1Points: 4, player2Points: 0, winnerId: "a" }));
  assert.ok("error" in applyPoint({ ...base, sets: won, scorerId: "b", points: 1 }));
});

// ── Repair ──
test("repair never gives B a second participation; leftover goes to a decision", () => {
  const plan = planRoundRepair({
    round: 3,
    eligible: [P("a", 1), P("b", 1), P("c", 1)],
    roundMatches: [M("m1", 3, "b", "c", "b")],
    opponents: {},
  });
  assert.deepEqual(plan.missing, ["a"]);
  assert.equal(plan.proposals.length, 0); // no "a × b" (b already played round 3)
  assert.equal(plan.unresolved[0].userId, "a");
});

test("repair pairs only missing players, is a no-op when nothing is missing", () => {
  const plan = planRoundRepair({ round: 2, eligible: [P("a", 1), P("b", 1), P("c", 0), P("d", 0)], roundMatches: [M("m1", 2, "a", "b", "a")], opponents: {} });
  assert.deepEqual(plan.proposals.map((p) => pairKey(p.player1Id, p.player2Id)), ["c×d"]);
  const after = planRoundRepair({ round: 2, eligible: [P("a", 1), P("b", 1), P("c", 0), P("d", 0)], roundMatches: [M("m1", 2, "a", "b", "a"), M("m2", 2, "c", "d", null)], opponents: {} });
  assert.ok(after.noop);
});

// ── Classification: win, loss, bye, W.O. ──
import { computeSwissStandings } from "../src/lib/standings.ts";
test("win, loss, bye and W.O. in the Swiss table", () => {
  const rows = computeSwissStandings(["a", "b", "c"], [
    { round: 1, status: "FINISHED", player1Id: "a", player2Id: "b", winnerId: "a", points: [{ userId: "a", points: 4 }, { userId: "b", points: 2 }] },
    { round: 1, status: "FINISHED", player1Id: "c", player2Id: "c", winnerId: "c", isWalkover: true },
    // W.O. after some points: win for c, those points are not battle points.
    { round: 2, status: "FINISHED", player1Id: "b", player2Id: "c", winnerId: "c", isWalkover: true, points: [{ userId: "b", points: 3 }] },
  ], 2);
  const by = Object.fromEntries(rows.map((r) => [r.userId, r]));
  assert.deepEqual([by.a.swissPoints, by.a.wins, by.a.battlePoints], [1, 1, 4]);
  assert.deepEqual([by.b.swissPoints, by.b.losses, by.b.battlePoints], [0, 2, 2]);
  assert.deepEqual([by.c.swissPoints, by.c.wins, by.c.byes, by.c.played, by.c.battlePoints], [2, 1, 1, 1, 0]);
});
