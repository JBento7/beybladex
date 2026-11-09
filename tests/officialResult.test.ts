// Official result (lib/officialResult): correction → final (by bracket) →
// classification; never the Swiss leader for an event with a final.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCorrectionOrder, findFinal, finalIssues, placementConflict, resolveOfficialPodium, type ResultMatch } from "../src/lib/officialResult.ts";

const swiss = (r: number, a: string, b: string, w: string): ResultMatch => ({ round: r, status: "FINISHED", player1Id: a, player2Id: b, winnerId: w });
// 3 Swiss rounds, top 4: semis (round 4), final + 3rd place (round 5).
const event = (final: Partial<ResultMatch>, extra: ResultMatch[] = []): ResultMatch[] => [
  swiss(1, "tartaruga", "x1", "tartaruga"), swiss(2, "tartaruga", "x2", "tartaruga"), swiss(3, "tartaruga", "dominic", "tartaruga"),
  { id: "s1", round: 4, status: "FINISHED", player1Id: "tartaruga", player2Id: "x3", winnerId: "tartaruga" },
  { id: "s2", round: 4, status: "FINISHED", player1Id: "dominic", player2Id: "x4", winnerId: "dominic" },
  { id: "f", round: 5, status: "FINISHED", player1Id: "tartaruga", player2Id: "dominic", winnerId: "dominic", ...final },
  { id: "t", round: 5, status: "FINISHED", player1Id: "x3", player2Id: "x4", winnerId: "x4", isThirdPlace: true },
  ...extra,
];
const ids = ["tartaruga", "dominic", "x1", "x2", "x3", "x4"];
const stored = (first: string) => ids.map((u, i) => ({ userId: u, placement: u === first ? 1 : i + 2 }));
const resolve = (matches: ResultMatch[], placements = stored("tartaruga"), correction?: unknown) =>
  resolveOfficialPodium({ format: "SWISS", status: "FINISHED", swissRounds: 3, matches, placements, correction });

test("Swiss leader loses the final: the final's winner is the champion", () => {
  const r = resolve(event({}));
  assert.deepEqual([r.first, r.second, r.third, r.source], ["dominic", "tartaruga", "x4", "final"]);
});

test("Dominic wins whether he is player 1 or player 2", () => {
  assert.equal(resolve(event({ player1Id: "dominic", player2Id: "tartaruga" })).first, "dominic");
  assert.equal(resolve(event({ player1Id: "tartaruga", player2Id: "dominic" })).first, "dominic");
});

test("the third-place match and the semifinal never define the champion", () => {
  const m = event({});
  assert.equal(findFinal(m, 3).final?.id, "f");
  const noFinal = m.filter((x) => x.id !== "f");
  const r = resolve(noFinal);
  assert.equal(r.first, undefined, "only semis + 3rd place: no champion");
  assert.match(r.pending ?? "", /final ainda não foi gerada/);
});

test("unfinished or incoherent final: no automatic champion; conflicts are pending", () => {
  assert.equal(resolve(event({ status: "IN_PROGRESS", winnerId: null })).first, undefined);
  assert.equal(resolve(event({ status: "IN_PROGRESS", winnerId: null })).pending, null, "not decided yet is not a conflict");
  const outsider = resolve(event({ winnerId: "x1" }));
  assert.equal(outsider.first, undefined);
  assert.match(outsider.pending ?? "", /não é um dos jogadores/);
  const sets = resolve(event({ setWinners: ["tartaruga", "tartaruga", "dominic"] }));
  assert.equal(sets.first, undefined, "sets 2×1 for Tartaruga contradict a Dominic win");
  assert.match(sets.pending ?? "", /sets não confirmam/);
  assert.equal(resolve(event({ isWalkover: true, setWinners: [] })).first, "dominic", "W.O. needs no sets");
  assert.deepEqual(finalIssues({ round: 5, status: "FINISHED", player1Id: "a", player2Id: "b", winnerId: "a", setWinners: ["a", "b", "a"] }), []);
});

test("an active official correction wins over the matches and is used by every screen", () => {
  const corr = { order: ["dominic", "tartaruga", "x4"], reason: "Organização confirmou", actorId: "adm", at: "2026-11-09" };
  const r = resolve(event({ winnerId: "tartaruga" }), stored("tartaruga"), corr);
  assert.deepEqual([r.first, r.second, r.source], ["dominic", "tartaruga", "admin"]);
  assert.equal(resolve(event({}), stored("dominic"), { order: ["dominic"], reason: "" }).source, "final", "no reason → not an active correction");
  assert.equal(resolve(event({}), stored("dominic"), { order: ["ghost"], reason: "x" }).source, "final", "unknown player → ignored");
});

test("events without a knockout use the stored classification; never the Swiss leader for an event with a final", () => {
  const pure = [swiss(1, "a", "b", "a"), swiss(2, "a", "c", "a")];
  const r = resolveOfficialPodium({ format: "SWISS", status: "FINISHED", swissRounds: 2, matches: pure, placements: [{ userId: "b", placement: 1 }, { userId: "a", placement: 2 }] });
  assert.deepEqual([r.first, r.source], ["b", "placement"]);
  assert.equal(resolveOfficialPodium({ format: "SWISS", status: "IN_PROGRESS", swissRounds: 2, matches: pure, placements: [] }).first, undefined);
});

test("correction order and stored-placement conflict", () => {
  assert.deepEqual(applyCorrectionOrder(["tartaruga", "dominic", "x4", "x3"], { order: ["dominic", "tartaruga"], reason: "r", actorId: "a", at: "" }), ["dominic", "tartaruga", "x4", "x3"]);
  assert.deepEqual(applyCorrectionOrder(["a", "b"], null), ["a", "b"]);
  assert.match(placementConflict(resolve(event({})), stored("tartaruga")) ?? "", /difere do campeão oficial/);
  assert.equal(placementConflict(resolve(event({})), stored("dominic")), null);
});
