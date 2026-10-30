// Layout compositions (lib/layoutDoc): legacy migration keeps the look,
// server validation, history, snapping, mirroring, restore, diff.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCOREBOARD_DEFAULTS, WINNER_DEFAULTS, fieldStyle } from "../src/lib/arenaLayout.ts";
import {
  centered, diffCompositions, emptyHistory, fromLegacy, groupOf, mirrorField, record, redo, resizeKeepRatio,
  restoreDefaults, sameComposition, snapMove, undo, validateComposition, type Composition,
} from "../src/lib/layoutDoc.ts";

const legacy = {
  layout: { nameL: { x: 12, y: 9, w: 22, fs: 2.1, ff: "Oswald" }, scoreR: { x: 61.5, y: 56, w: 12, fs: 7 } },
  hidden: ["obs", "naoExiste"],
  customs: [{ key: "custom_1", label: "Mesa", type: "int", value: "3", x: 40, y: 20, w: 10, fs: 1.5 }],
  bg: { url: "data:image/png;base64,AAAA" },
  fonts: [{ family: "Oswald", kind: "google" }, { family: "Outra", kind: "google" }],
};

test("legacy layouts migrate with exactly the same geometry, visibility, customs, bg and fonts", () => {
  const c = fromLegacy("scoreboard", legacy, SCOREBOARD_DEFAULTS);
  for (const k of Object.keys(SCOREBOARD_DEFAULTS)) {
    const { kind: _k, label: _l, ...expected } = fieldStyle(SCOREBOARD_DEFAULTS, k, legacy.layout as never);
    assert.deepEqual(c.fields[k], expected, k);
  }
  assert.deepEqual(c.hidden, ["obs"]);
  assert.deepEqual(c.customs, [{ key: "custom_1", label: "Mesa", type: "int", value: "3" }]);
  assert.deepEqual(c.fields.custom_1, { x: 40, y: 20, w: 10, fs: 1.5 });
  assert.equal(c.bg, "data:image/png;base64,AAAA");
  assert.deepEqual(c.fonts, [{ family: "Oswald", kind: "google" }]); // only fonts used
  assert.deepEqual(c.locked, []); // legacy elements start unlocked
  assert.equal(validateComposition("scoreboard", c, SCOREBOARD_DEFAULTS).ok, true);
});

test("server validation: unknown keys, bad numbers, missing fonts, bad bg, customs elsewhere", () => {
  const base = fromLegacy("scoreboard", {}, SCOREBOARD_DEFAULTS);
  const bad = (patch: Partial<Composition> & Record<string, unknown>) => validateComposition("scoreboard", { ...base, ...patch }, SCOREBOARD_DEFAULTS);
  assert.equal(bad({ fields: { ...base.fields, hacker: { x: 1, y: 1 } } }).ok, false);
  assert.equal(bad({ fields: { ...base.fields, nameL: { x: "abc", y: 1 } as never } }).ok, false);
  assert.equal(bad({ fields: { ...base.fields, nameL: { ...base.fields.nameL, ff: "Inexistente" } } }).ok, false);
  assert.equal(bad({ bg: "javascript:alert(1)" }).ok, false);
  assert.equal(bad({ hidden: ["nope"] }).ok, false);
  assert.equal(bad({ customs: [{ key: "custom_1", label: "", type: "text", value: "" }] }).ok, false);
  assert.equal(validateComposition("winner", { ...fromLegacy("winner", {}, WINNER_DEFAULTS), customs: [{ key: "custom_1", label: "x", type: "text", value: "" }] }, WINNER_DEFAULTS).ok, false);
  // Out-of-range values are clamped (normalized), not stored as-is.
  const ok = bad({ fields: { ...base.fields, nameL: { x: 999, y: 5, w: 0, fs: 99 } } });
  assert.ok(ok.ok && ok.value.fields.nameL.x === 120 && ok.value.fields.nameL.w === 0.5 && ok.value.fields.nameL.fs === 30);
});

test("history: undo/redo, and a new edit after undo drops the redo path", () => {
  let h = emptyHistory<number>();
  let cur = 0;
  h = record(h, cur); cur = 1;
  h = record(h, cur); cur = 2;
  const u = undo(h, cur)!; h = u.h; cur = u.value;
  assert.equal(cur, 1);
  const r = redo(h, cur)!; h = r.h; cur = r.value;
  assert.equal(cur, 2);
  const u2 = undo(h, cur)!; h = u2.h; cur = u2.value;
  h = record(h, cur); cur = 5; // new edit
  assert.equal(redo(h, cur), null);
  assert.equal(undo(emptyHistory<number>(), 0), null);
});

test("snapping, centring, mirroring, keep ratio", () => {
  const s = snapMove("img", { x: 49.6, y: 10, w: 10, h: 10 }, { x: [50], y: [] });
  assert.deepEqual([s.x, s.guides.x], [50, 50]); // left edge snapped to the centre line
  assert.deepEqual(snapMove("text", { x: 40, y: 10 }, { x: [50], y: [] }).guides, { x: null, y: null });
  assert.equal(centered("text", { x: 10, y: 10 }, "h").x, 50);
  assert.equal(centered("img", { x: 10, y: 10, w: 20, h: 10 }, "v").y, 45);
  assert.equal(mirrorField("img", { x: 3.65, y: 1, w: 18, h: 28 }).x, 78.35);
  assert.equal(mirrorField("text", { x: 13.1, y: 1 }).x, 86.9);
  assert.deepEqual(resizeKeepRatio({ x: 0, y: 0, w: 10, h: 20 }, 15), { w: 15, h: 30 });
});

test("restore defaults keeps customs, bg and fonts; diff names changed elements", () => {
  const c = fromLegacy("scoreboard", legacy, SCOREBOARD_DEFAULTS);
  const r = restoreDefaults(c, SCOREBOARD_DEFAULTS);
  assert.deepEqual(r.fields.custom_1, c.fields.custom_1);
  assert.deepEqual(r.customs, c.customs);
  assert.equal(r.bg, c.bg);
  assert.deepEqual(r.hidden, []);
  const { kind: _k, label: _l, ...def } = SCOREBOARD_DEFAULTS.nameL;
  assert.deepEqual(r.fields.nameL, def);
  const d = diffCompositions(c, r);
  assert.deepEqual(d.changed, ["nameL", "obs", "scoreR"]);
  assert.equal(sameComposition(c, c), true);
  assert.equal(groupOf("scoreboard", "nameL"), "left");
  assert.equal(groupOf("scoreboard", "scoreR"), "score");
  assert.equal(groupOf("scoreboard", "custom_1"), "custom");
  assert.equal(groupOf("winner", "deck1"), "winner");
});

test("compositions compare by value, not by key order (the database reorders JSON keys)", () => {
  const a = fromLegacy("scoreboard", legacy, SCOREBOARD_DEFAULTS);
  const reordered = JSON.parse(JSON.stringify(a), (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v));
  assert.notEqual(JSON.stringify(reordered), JSON.stringify(a));
  assert.deepEqual(diffCompositions(a, reordered), { changed: [], meta: [] });
  assert.equal(sameComposition(a, reordered), true);
});
