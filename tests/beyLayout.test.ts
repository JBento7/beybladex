// Beyblade elements of the placar/vencedor (docs/EDITOR-LAYOUT.md § Beyblades):
// CX / CX Expand pieces per spot, inheritance that keeps old layouts as they
// were, demonstration examples from the catalog (editor only) and the real
// pieces of a player's bey (telão).
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCOREBOARD_DEFAULTS, WINNER_DEFAULTS, beyFieldKeys, beyFormatOf, fieldStyle } from "../src/lib/arenaLayout.ts";
import { completeComposition, fromLegacy, validateComposition } from "../src/lib/layoutDoc.ts";
import { buildExamples, pieceMarker } from "../src/lib/beyExamples.ts";
import { beyPiecesOf, mainBladeName } from "../src/lib/beyArt.ts";

test("each format has its own elements per spot (CX ≠ CX Expand)", () => {
  assert.deepEqual(beyFieldKeys("L").CX, ["cxAssistL", "cxMetalL", "cxLockL"]);
  assert.deepEqual(beyFieldKeys("R").CX_EXPAND, ["cxeAssistR", "cxeMetalR", "cxeOverR", "cxeLockR"]);
  assert.deepEqual(beyFieldKeys("deck2").BXUX, ["deck2"]);
  assert.deepEqual(beyFieldKeys("deck2").CX_EXPAND, ["deck2CxeAssist", "deck2CxeMetal", "deck2CxeOver", "deck2CxeLock"]);
  for (const spot of ["deck1", "deck2", "deck3"]) for (const k of Object.values(beyFieldKeys(spot)).flat()) assert.ok(WINNER_DEFAULTS[k], k);
  for (const spot of ["L", "R"]) for (const k of Object.values(beyFieldKeys(spot)).flat()) assert.ok(SCOREBOARD_DEFAULTS[k], k);
  assert.equal(beyFormatOf("deck1"), "BXUX");
  assert.equal(beyFormatOf("deck1CxLock"), "CX");
  assert.equal(beyFormatOf("deck1CxeLock"), "CX_EXPAND");
  assert.equal(beyFormatOf("cxeOverL"), "CX_EXPAND");
  assert.equal(beyFormatOf("photo"), null);
  assert.match(WINNER_DEFAULTS.deck3CxeOver.label, /Beyblade 3 · CX Expand · Over Blade/);
});

test("old layouts: new pieces start where the existing element already is (telão and editor)", () => {
  // A winner layout from before: Beyblade 1 moved, Beyblade 2 hidden.
  const saved = { deck1: { x: 30, y: 50, w: 20, h: 30 } };
  assert.deepEqual(
    [fieldStyle(WINNER_DEFAULTS, "deck1CxLock", saved).x, fieldStyle(WINNER_DEFAULTS, "deck1CxeOver", saved).w],
    [30, 20], "telão: CX and CX Expand pieces follow the saved Beyblade 1 box");
  assert.equal(fieldStyle(WINNER_DEFAULTS, "deck1", saved).x, 30, "BX/UX position untouched");
  const c = fromLegacy("winner", { layout: saved, hidden: ["deck2"] }, WINNER_DEFAULTS);
  assert.deepEqual(c.fields.deck1CxeLock, { x: 30, y: 50, w: 20, h: 30 }, "editor gets the same inherited values");
  assert.ok(c.hidden.includes("deck2CxLock") && c.hidden.includes("deck2CxeOver"), "a hidden position keeps its pieces hidden");
  assert.ok(!c.hidden.includes("deck1CxLock"));
  assert.equal(validateComposition("winner", c, WINNER_DEFAULTS).ok, true, "new elements persist in the winner layout");
  // Scoreboard: CX Expand follows the CX pieces (over blade follows the main blade).
  const sb = { cxMetalL: { x: 5, y: 60, w: 10, h: 18 } };
  assert.deepEqual([fieldStyle(SCOREBOARD_DEFAULTS, "cxeOverL", sb).x, fieldStyle(SCOREBOARD_DEFAULTS, "cxeMetalL", sb).h], [5, 18]);
  // A version published before the new elements existed.
  const old = { fields: { deck1: { x: 30, y: 50, w: 20, h: 30 } }, hidden: [], customs: [], bg: null, fonts: [], locked: [], keepRatio: [] };
  const done = completeComposition(old, WINNER_DEFAULTS);
  assert.deepEqual(done.fields.deck1CxeAssist, { x: 30, y: 50, w: 20, h: 30 });
  // Once edited on its own, a piece keeps its own value.
  assert.equal(fieldStyle(WINNER_DEFAULTS, "deck1CxLock", { ...saved, deck1CxLock: { x: 33, y: 52, w: 8, h: 8 } }).w, 8);
});

const cat = (line: string, category: string, name: string, imageUrl: string | null = `https://img/${line}-${category}-${name}.png`) => ({ line, category, name, imageUrl });

test("examples: one coherent set per format from the catalog, images preferred", () => {
  const ex = buildExamples([
    cat("BX", "BLADE", "Dran Sword"), cat("UX", "BLADE", "Wizard Rod"), cat("BX", "BLADE", "Aaa Sem Foto", null),
    cat("CX", "LOCK_CHIP", "Dran"), cat("CX", "MAIN_BLADE", "Brave"), cat("CX", "ASSIST_BLADE", "Slash"),
    cat("CX_EXPAND", "LOCK_CHIP", "Emperor"), cat("CX_EXPAND", "OVER_BLADE", "Might"), cat("CX_EXPAND", "MAIN_BLADE", "Arc"), cat("CX_EXPAND", "ASSIST_BLADE", "Wheel"),
    cat("RATCHET", "RATCHET", "3-60"), cat("BIT", "BIT", "F"),
  ]);
  assert.equal(ex.BX.img, "https://img/BX-BLADE-Dran Sword.png", "part with image wins over one without");
  assert.equal(ex.UX.img, "https://img/UX-BLADE-Wizard Rod.png", "UX is not the BX image");
  assert.equal(ex.BX.pieces, null);
  assert.deepEqual(ex.CX.pieces, { kind: "CX", lock: "https://img/CX-LOCK_CHIP-Dran.png", metal: "https://img/CX-MAIN_BLADE-Brave.png", assist: "https://img/CX-ASSIST_BLADE-Slash.png", over: null });
  assert.equal(ex.CX_EXPAND.pieces!.kind, "CX_EXPAND");
  assert.equal(ex.CX_EXPAND.pieces!.over, "https://img/CX_EXPAND-OVER_BLADE-Might.png", "CX Expand has its own over blade");
  assert.equal(ex.CX_EXPAND.pieces!.metal, "https://img/CX_EXPAND-MAIN_BLADE-Arc.png", "main blade of its own line (not the CX one)");
  assert.equal(ex.CX_EXPAND.parts.length, 4);
  assert.equal(ex.CX.parts.length, 3);
  assert.match(ex.BX.name, /Dran Sword 3-60F/);
});

test("examples: missing images become a marker named after the piece — never another category's image", () => {
  const ex = buildExamples([cat("CX", "MAIN_BLADE", "Brave", null), cat("BX", "BLADE", "Dran Sword")]);
  const metal = ex.CX.parts.find((p) => p.role === "metal")!;
  assert.equal(metal.fromCatalog, false);
  assert.ok(metal.src.startsWith("data:image/svg+xml"));
  assert.match(decodeURIComponent(metal.src), /Brave/, "marker carries the part name");
  const lock = ex.CX.parts.find((p) => p.role === "lock")!;
  assert.match(decodeURIComponent(lock.src), /Lock/);
  assert.ok(!Object.values(ex.CX.pieces!).includes("https://img/BX-BLADE-Dran Sword.png"), "no BX image inside the CX example");
  assert.ok(ex.UX.img!.startsWith("data:image/svg+xml") && decodeURIComponent(ex.UX.img!).includes("UX"), "UX without catalog: UX marker, not the BX blade");
  assert.notEqual(pieceMarker("CX", "lock", "X"), pieceMarker("CX_EXPAND", "lock", "X"), "formats look different");
  assert.ok(!decodeURIComponent(pieceMarker("CX", "lock", "<script>")).includes("<script>"), "names are escaped");
});

test("telão (real beys): format decides the pieces; only the player's parts are looked up", async () => {
  const asked: string[] = [];
  const lookup = async (category: string, name: string | null) => { asked.push(`${category}:${name}`); return name ? `/img/${category}/${name}` : null; };
  const cx = await beyPiecesOf({ beyLine: "CX", lockChip: "Dran", metalBlade: "Brave", assistBlade: "Slash", overBlade: "Ignorada" }, lookup);
  assert.deepEqual(cx, { kind: "CX", lock: "/img/LOCK_CHIP/Dran", metal: "/img/MAIN_BLADE/Brave", assist: "/img/ASSIST_BLADE/Slash", over: null });
  assert.ok(!asked.some((a) => a.startsWith("OVER_BLADE")), "CX never asks for an over blade");
  const cxe = await beyPiecesOf({ beyLine: "CX_EXPAND", lockChip: "Emperor", metalBlade: "Arc", assistBlade: "Wheel", overBlade: "Might" }, lookup);
  assert.equal(cxe!.kind, "CX_EXPAND");
  assert.equal(cxe!.over, "/img/OVER_BLADE/Might");
  assert.equal(await beyPiecesOf({ beyLine: "BX", blade: "Dran Sword" }, lookup), null, "BX/UX: no pieces (blade art)");
  assert.equal(await beyPiecesOf({ beyLine: "CX" }, async () => null), null, "no real image → absence handling, no demo image");
  assert.equal(mainBladeName({ beyLine: "CX_EXPAND", overBlade: "Might", metalBlade: "Arc" }), "Might");
  assert.equal(mainBladeName({ beyLine: "UX", blade: "Wizard Rod" }), "Wizard Rod");
});
