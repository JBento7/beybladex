// Deck formats (lib/deckFormat): sizes, labels, parts rule, trio checks.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkRegisteredDeck, checkTrio, deckLabel, findDuplicateParts, hasMatchTrio, orderMatchesTrio, parseDeckType,
  registeredDeckSize, registrationComplete, trioCombinations, usesBattleDeck, validTrios, changedSinceRegistration, snapshotOf,
} from "../src/lib/deckFormat.ts";

const bey = (id: string, blade: string, ratchet: string, bit: string) => ({ id, name: `B ${id}`, blade, ratchet, bit });
// a and b share the bit "Rush"; c, d distinct.
const A = bey("a", "Dran Sword", "3-60", "Rush");
const B = bey("b", "Wizard Arrow", "4-80", "rush ");
const C = bey("c", "Knight Shield", "5-60", "Ball");
const D = bey("d", "Hells Scythe", "4-60", "Taper");

test("enum is validated; existing formats preserved", () => {
  assert.equal(parseDeckType("SOLO"), "SOLO");
  assert.equal(parseDeckType("THREE_ON_THREE"), "THREE_ON_THREE");
  assert.equal(parseDeckType("THREE_ON_THREE_PLUS_ONE"), "THREE_ON_THREE_PLUS_ONE");
  for (const bad of ["three_on_three", "4on4", "", null, 3]) assert.equal(parseDeckType(bad), null);
  assert.deepEqual([registeredDeckSize("SOLO"), registeredDeckSize("THREE_ON_THREE"), registeredDeckSize("THREE_ON_THREE_PLUS_ONE")], [1, 3, 4]);
  assert.ok(usesBattleDeck("THREE_ON_THREE") && usesBattleDeck("THREE_ON_THREE_PLUS_ONE") && !usesBattleDeck("SOLO"));
  assert.ok(hasMatchTrio("THREE_ON_THREE_PLUS_ONE") && !hasMatchTrio("THREE_ON_THREE"));
});

test("labels never show the internal enum", () => {
  assert.equal(deckLabel("THREE_ON_THREE_PLUS_ONE"), "3on3 + 1 reserva");
  assert.equal(deckLabel("THREE_ON_THREE_PLUS_ONE", true), "3 on 3 + 1 reserva");
  assert.equal(deckLabel("THREE_ON_THREE", true), "3 on 3");
  assert.equal(deckLabel("SOLO"), "Solo");
});

test("registration needs exactly 4 distinct; 3 or 5 rejected", () => {
  assert.equal(checkRegisteredDeck("THREE_ON_THREE_PLUS_ONE", [A, B, C], false).ok, false);
  assert.equal(checkRegisteredDeck("THREE_ON_THREE_PLUS_ONE", [A, B, C, D, bey("e", "x", "y", "z")], false).ok, false);
  assert.equal(checkRegisteredDeck("THREE_ON_THREE_PLUS_ONE", [A, A, C, D], false).ok, false);
  assert.ok(checkRegisteredDeck("THREE_ON_THREE_PLUS_ONE", [A, B, C, D], false).ok);
});

test("official: the 4 may share parts if at least one trio is valid; parts rule is per active trio", () => {
  // a and b share "Rush" (case/space-insensitive, same normalization as before).
  assert.deepEqual(findDuplicateParts([A, B]), ['Bit "rush"']);
  assert.ok(checkRegisteredDeck("THREE_ON_THREE_PLUS_ONE", [A, B, C, D], true).ok);
  const valid = validTrios([A, B, C, D], true).map((t) => t.reserve).sort();
  assert.deepEqual(valid, ["a", "b"]); // only trios leaving a or b out are valid
  // No valid trio at all → rejected.
  const E = bey("e", "Dran Sword", "9-60", "Orb"); // shares blade with A
  const F = bey("f", "Wizard Arrow", "1-60", "Hexa"); // shares blade with B
  assert.equal(checkRegisteredDeck("THREE_ON_THREE_PLUS_ONE", [A, B, E, F], true).ok, false);
  // Casual events keep their policy (no parts rule).
  assert.ok(checkRegisteredDeck("THREE_ON_THREE_PLUS_ONE", [A, B, E, F], false).ok);
  // 3on3 unchanged: any repeated part in the 3 is refused in official events.
  assert.equal(checkRegisteredDeck("THREE_ON_THREE", [A, B, C], true).ok, false);
});

test("trio: exactly 3 of the 4 registered, reserve derived, no 5th, no repeats", () => {
  const reg = [A, B, C, D];
  const ok = checkTrio(reg, ["a", "c", "d"], true);
  assert.ok(ok.ok && ok.reserve === "b");
  assert.equal(checkTrio(reg, ["a", "b", "c"], true).ok, false); // repeats "Rush" in official
  assert.ok(checkTrio(reg, ["a", "b", "c"], false).ok);           // casual: allowed
  assert.equal(checkTrio(reg, ["a", "c"], false).ok, false);
  assert.equal(checkTrio(reg, ["a", "c", "d", "b"], false).ok, false);
  assert.equal(checkTrio(reg, ["a", "a", "c"], false).ok, false);
  assert.equal(checkTrio(reg, ["a", "c", "zzz"], false).ok, false); // 5th / outside id
  assert.equal(checkTrio([A, B, C], ["a", "b", "c"], false).ok, false); // incomplete registration
  assert.equal(trioCombinations(["a", "b", "c", "d"]).length, 4);
});

test("deck order must be exactly the trio (never the reserve)", () => {
  assert.ok(orderMatchesTrio(["c", "a", "d"], ["a", "c", "d"]));
  assert.equal(orderMatchesTrio(["c", "a", "b"], ["a", "c", "d"]), false);
  assert.equal(orderMatchesTrio(["c", "c", "a"], ["a", "c", "d"]), false);
});

test("registration completeness and snapshot change detection", () => {
  assert.ok(registrationComplete("THREE_ON_THREE_PLUS_ONE", { beyblade1: "a", beyblade2: "b", beyblade3: "c", beyblade4: "d" }));
  assert.equal(registrationComplete("THREE_ON_THREE_PLUS_ONE", { beyblade1: "a", beyblade2: "b", beyblade3: "c" }), false);
  assert.ok(registrationComplete("THREE_ON_THREE", { beyblade1: "a", beyblade2: "b", beyblade3: "c" }));
  const snap = snapshotOf(A);
  assert.equal(changedSinceRegistration(snap, { ...A }), false);
  assert.ok(changedSinceRegistration(snap, { ...A, bit: "Flat" }));
  assert.ok(changedSinceRegistration(snap, null)); // removed from the repertoire
});
