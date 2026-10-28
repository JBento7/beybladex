// Match authorization (lib/matchPolicy): the same rule for points, W.O.,
// undo, countdown, sides and deck order.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideMatchOp, type Actor, type MatchContext, type MatchOp } from "../src/lib/matchPolicy.ts";

const ctx = (over: Partial<MatchContext["tournament"]> = {}, rest: Partial<MatchContext> = {}): MatchContext => ({
  judgeId: null, player1Id: "p1", player2Id: "p2",
  tournament: { organizerId: "org", isOfficial: true, isTest: false, communitySlug: "lbl", isPartnership: false, judgingMode: "RESTRICTED", ...over },
  ...rest,
});
const user = (id: string, over: Partial<Actor> = {}): Actor => ({ id, role: "PARTICIPANT", canJudge: false, adminCommunity: null, email: `${id}@x.test`, ...over });
const OPS: MatchOp[] = ["score", "walkover", "undo", "countdown", "ready", "launch", "onair", "sides"];

test("visitor is blocked (401) for every operation", () => {
  for (const op of OPS) assert.deepEqual(decideMatchOp(null, ctx(), op).allowed, false);
  assert.equal((decideMatchOp(null, ctx(), "score") as { status: number }).status, 401);
});

test("no assigned judge does NOT let any logged-in user score", () => {
  for (const op of OPS) assert.equal(decideMatchOp(user("spectator"), ctx({ isOfficial: false }), op).allowed, false);
});

test("participant without permission is blocked, even playing the match", () => {
  const c = ctx({}, { actorIsParticipant: true });
  for (const op of OPS) assert.equal(decideMatchOp(user("p1"), c, op).allowed, false);
});

test("judges: account-wide judge and the match's assigned judge are allowed", () => {
  assert.ok(decideMatchOp(user("j", { canJudge: true }), ctx(), "score").allowed);
  assert.ok(decideMatchOp(user("aj"), ctx({}, { judgeId: "aj" }), "walkover").allowed);
});

test("judge kiosk accounts only for their league (plus partnerships, tests, BeyEncontros)", () => {
  const lbm = user("k", { canJudge: true, email: "juiz1@lbm.juiz" });
  assert.equal(decideMatchOp(lbm, ctx({ communitySlug: "lbl" }), "score").allowed, false);
  assert.ok(decideMatchOp(lbm, ctx({ communitySlug: "lbm" }), "score").allowed);
  assert.ok(decideMatchOp(lbm, ctx({ communitySlug: "lbl", isPartnership: true }), "score").allowed);
  assert.ok(decideMatchOp(lbm, ctx({ communitySlug: "lbl", isOfficial: false }), "score").allowed);
});

test("organizer: BeyEncontro creator allowed; creator of an official event needs admin scope", () => {
  assert.ok(decideMatchOp(user("org"), ctx({ isOfficial: false }), "score").allowed);
  assert.equal(decideMatchOp(user("org"), ctx({ isOfficial: true }), "score").allowed, false);
});

test("admins: in scope allowed, other community blocked, partnership allowed", () => {
  assert.ok(decideMatchOp(user("a", { role: "ORGANIZER" }), ctx(), "score").allowed);
  const lbmAdmin = user("b", { role: "ORGANIZER", adminCommunity: "lbm" });
  assert.equal(decideMatchOp(lbmAdmin, ctx({ communitySlug: "lbl" }), "score").allowed, false);
  assert.ok(decideMatchOp(lbmAdmin, ctx({ communitySlug: "lbm" }), "score").allowed);
  assert.ok(decideMatchOp(lbmAdmin, ctx({ communitySlug: "lbl", isPartnership: true }), "score").allowed);
  // …but can still referee a match they were explicitly assigned to.
  assert.ok(decideMatchOp(lbmAdmin, ctx({ communitySlug: "lbl" }, { judgeId: "b" }), "score").allowed);
});

test("open judging is explicit, only for approved participants, never on official events", () => {
  const open = ctx({ isOfficial: false, judgingMode: "OPEN_PARTICIPANTS" }, { actorIsParticipant: true });
  assert.ok(decideMatchOp(user("p9"), open, "score").allowed);
  assert.equal(decideMatchOp(user("p9"), { ...open, actorIsParticipant: false }, "score").allowed, false);
  assert.equal(decideMatchOp(user("p9"), ctx({ isOfficial: true, judgingMode: "OPEN_PARTICIPANTS" }, { actorIsParticipant: true }), "score").allowed, false);
  // Open judging never lets someone set ANOTHER player's deck order.
  assert.equal(decideMatchOp(user("p9"), open, "deckOrder").allowed, false);
});

test("points and W.O. use the same rule", () => {
  const actors = [user("x"), user("j", { canJudge: true }), user("a", { role: "ORGANIZER" }), user("o"), user("p1")];
  const contexts = [ctx(), ctx({ isOfficial: false, organizerId: "o" }), ctx({}, { judgeId: "x" })];
  for (const a of actors) for (const c of contexts) {
    assert.equal(decideMatchOp(a, c, "score").allowed, decideMatchOp(a, c, "walkover").allowed);
    assert.equal(decideMatchOp(a, c, "score").allowed, decideMatchOp(a, c, "undo").allowed);
  }
});

test("players may set only their own deck order", () => {
  assert.ok(decideMatchOp(user("p1"), ctx(), "deckOrderOwn").allowed);
  assert.equal(decideMatchOp(user("p1"), ctx(), "deckOrder").allowed, false);
  assert.equal(decideMatchOp(user("zz"), ctx(), "deckOrderOwn").allowed, false);
});
