// Beyblade elements of the placar/vencedor (docs/EDITOR-LAYOUT.md § Beyblades):
// CX / CX Expand pieces per spot, inheritance that keeps old layouts as they
// were, demonstration examples from the catalog (editor only) and the real
// pieces of a player's bey (telão).
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCOREBOARD_DEFAULTS, WINNER_DEFAULTS, beyFieldKeys, beyFormatOf, cxAssembly, cxBoxes, fieldStyle } from "../src/lib/arenaLayout.ts";
import { leftPlayerId, scoreboardSideOf } from "../src/lib/matchSides.ts";
import { assemblyBoxes, assemblyKeys } from "../src/lib/arenaLayout.ts";
import { bbox, copyBoxes, mirrorAssembly, moveAssembly, scaleAssembly } from "../src/lib/beyAssembly.ts";
import { completeComposition, fromLegacy, validateComposition } from "../src/lib/layoutDoc.ts";
import { buildExamples, pieceMarker } from "../src/lib/beyExamples.ts";
import { beyPiecesOf, mainBladeName } from "../src/lib/beyArt.ts";

test("each format has its own elements per spot (CX ≠ CX Expand)", () => {
  assert.deepEqual(beyFieldKeys("L").CX, ["cxAssistL", "cxMetalL", "cxLockL"]);
  assert.deepEqual(beyFieldKeys("R").CX_EXPAND, ["cxeAssistR", "cxeMetalR", "cxeOverR", "cxeLockR"]);
  assert.deepEqual(beyFieldKeys("deck2").BXUX, ["deck2"]);
  assert.deepEqual(beyFieldKeys("deck2").CX_EXPAND, ["deck2Cxe"], "winner CX Expand = one assembly element");
  for (const spot of ["deck1", "deck2", "deck3"]) for (const k of Object.values(beyFieldKeys(spot)).flat()) assert.ok(WINNER_DEFAULTS[k], k);
  for (const spot of ["L", "R"]) for (const k of Object.values(beyFieldKeys(spot)).flat()) assert.ok(SCOREBOARD_DEFAULTS[k], k);
  assert.equal(beyFormatOf("deck1"), "BXUX");
  assert.equal(beyFormatOf("deck1Cx"), "CX");
  assert.deepEqual(beyFieldKeys("deck1").CX, ["deck1Cx"], "winner CX = one assembly element");
  assert.equal(beyFormatOf("deck1Cxe"), "CX_EXPAND");
  assert.equal(beyFormatOf("cxeOverL"), "CX_EXPAND");
  assert.equal(beyFormatOf("photo"), null);
  assert.match(WINNER_DEFAULTS.deck3Cxe.label, /Beyblade 3 · CX Expand \(conjunto\)/);
  assert.equal(WINNER_DEFAULTS.deck3Cxe.group, "CX_EXPAND");
  assert.equal(WINNER_DEFAULTS.deck3Cx.group, "CX");
});

test("old layouts: new pieces start where the existing element already is (telão and editor)", () => {
  // A winner layout from before: Beyblade 1 moved, Beyblade 2 hidden.
  const saved = { deck1: { x: 30, y: 50, w: 20, h: 30 } };
  const g = fieldStyle(WINNER_DEFAULTS, "deck1Cx", saved);
  assert.deepEqual([g.x, g.y], [40, 65], "CX assembly centred in the saved Beyblade 1 box");
  const ge = fieldStyle(WINNER_DEFAULTS, "deck1Cxe", saved);
  assert.deepEqual([ge.x, ge.y], [40, 65], "CX Expand assembly centred in the same box");
  assert.equal(fieldStyle(WINNER_DEFAULTS, "deck1", saved).x, 30, "BX/UX position untouched");
  const c = fromLegacy("winner", { layout: saved, hidden: ["deck2"] }, WINNER_DEFAULTS);
  assert.deepEqual(c.fields.deck1Cx, { x: 40, y: 65 }, "editor gets the same inherited centre");
  assert.deepEqual(c.fields.deck1Cxe, { x: 40, y: 65 });
  assert.ok(c.hidden.includes("deck2Cx") && c.hidden.includes("deck2Cxe"), "a hidden position keeps its assemblies hidden");
  assert.ok(!c.hidden.includes("deck1Cx"));
  assert.equal(validateComposition("winner", c, WINNER_DEFAULTS).ok, true, "new elements persist in the winner layout");
  // Scoreboard: CX Expand follows the CX pieces (over blade follows the main blade).
  const sb = { cxMetalL: { x: 5, y: 60, w: 10, h: 18 } };
  assert.deepEqual([fieldStyle(SCOREBOARD_DEFAULTS, "cxeOverL", sb).x, fieldStyle(SCOREBOARD_DEFAULTS, "cxeMetalL", sb).h], [5, 18]);
  // A version published before the new elements existed.
  const old = { fields: { deck1: { x: 30, y: 50, w: 20, h: 30 } }, hidden: [], customs: [], bg: null, fonts: [], locked: [], keepRatio: [] };
  const done = completeComposition(old, WINNER_DEFAULTS);
  assert.deepEqual(done.fields.deck1Cxe, { x: 40, y: 65 });
  // Elements that no longer exist (per-piece CX boxes of the previous editor) are dropped.
  const stale = completeComposition({ ...old, fields: { ...old.fields, deck1CxLock: { x: 1, y: 1, w: 1, h: 1 }, deck1CxeOver: { x: 1, y: 1, w: 1, h: 1 } }, hidden: ["deck1CxLock"], keepRatio: ["deck1CxeOver"] }, WINNER_DEFAULTS);
  assert.ok(!stale.fields.deck1CxLock && !stale.fields.deck1CxeOver && !stale.hidden.includes("deck1CxLock") && !stale.keepRatio.includes("deck1CxeOver"), "per-piece winner boxes of older editors dropped");
  assert.equal(validateComposition("winner", stale, WINNER_DEFAULTS).ok, true, "publishable");
  // Once moved on its own, the assembly keeps its own centre.
  assert.equal(fieldStyle(WINNER_DEFAULTS, "deck1Cx", { ...saved, deck1Cx: { x: 55, y: 70 } }).x, 55);
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

test("CX on the winner reuses the scoreboard sizes and assembly, moved as one set", () => {
  const sb = { cxAssistR: { x: 70, y: 50, w: 20, h: 30 }, cxMetalR: { x: 72, y: 52, w: 16, h: 24 }, cxLockR: { x: 78, y: 61, w: 4, h: 6 } };
  const board = cxBoxes(sb, "R");
  assert.deepEqual(board.map((b) => [b.piece, b.x, b.y, b.w, b.h]), [["assist", 70, 50, 20, 30], ["metal", 72, 52, 16, 24], ["lock", 78, 61, 4, 6]], "scoreboard: as configured, back → front");
  const a = cxAssembly(sb, "R");
  assert.deepEqual([a.w, a.h, a.cx, a.cy], [20, 30, 80, 65]);
  const win = cxBoxes(sb, "R", { x: 40, y: 70 });
  for (let i = 0; i < 3; i++) {
    assert.equal(win[i].w, board[i].w, "same width");
    assert.equal(win[i].h, board[i].h, "same height (same proportion)");
    assert.ok(Math.abs((win[i].x - win[0].x) - (board[i].x - board[0].x)) < 1e-9, "same horizontal offset between pieces");
    assert.ok(Math.abs((win[i].y - win[0].y) - (board[i].y - board[0].y)) < 1e-9, "same vertical offset");
  }
  assert.deepEqual([win[0].x, win[0].y], [30, 55], "assembly centred where the winner layout says — not the scoreboard coordinates");
  // Two CX positions: same sizes, independent positions.
  const p2 = cxBoxes(sb, "R", { x: 65, y: 70 });
  assert.equal(p2[1].w, win[1].w);
  assert.equal(p2[0].x - win[0].x, 25);
  // The LEFT side's config is a different reference.
  assert.notDeepEqual(cxBoxes(sb, "L", { x: 40, y: 70 }).map((b) => b.w), win.map((b) => b.w));
  // No custom config: scoreboard defaults.
  assert.equal(cxBoxes(null, "L", { x: 50, y: 50 })[0].w, SCOREBOARD_DEFAULTS.cxAssistL.w);
  // A new scoreboard size is reflected (nothing copied into the winner layout).
  assert.equal(cxBoxes({ ...sb, cxMetalR: { ...sb.cxMetalR, w: 18 } }, "R", { x: 40, y: 70 })[1].w, 18);
});

test("reference side: by player id and the real side mapping (sides swap every set)", () => {
  const m = { player1Id: "p1", player2Id: "p2", xSidePlayerId: "p1", maxSets: 3 };
  assert.equal(leftPlayerId(m, 1), "p2", "B side (p2) on the left in set 1");
  assert.equal(leftPlayerId(m, 2), "p1", "swapped in set 2");
  assert.equal(scoreboardSideOf(m, "p1", [{ setNumber: 1 }]), "R", "winner p1 was on the right");
  assert.equal(scoreboardSideOf(m, "p1", [{ setNumber: 1 }, { setNumber: 2 }]), "L", "last set played decides (set 2: swapped)");
  assert.equal(scoreboardSideOf(m, "p2", [{ setNumber: 1 }, { setNumber: 2 }, { setNumber: 3 }]), "L");
  assert.equal(scoreboardSideOf({ ...m, maxSets: 1 }, "p1", [{ setNumber: 1 }]), "R", "single set: no swap");
  assert.equal(scoreboardSideOf({ ...m, xSidePlayerId: null }, "p2", []), "R", "no sides chosen: player 1 left");
});

test("CX Expand assembly: its own pieces and config; winner inherits CX Expand, not CX", () => {
  assert.deepEqual(assemblyKeys("CX_EXPAND", "L"), ["cxeAssistL", "cxeMetalL", "cxeOverL", "cxeLockL"], "draw order assist → main → over → lock");
  assert.deepEqual(assemblyKeys("CX", "R"), ["cxAssistR", "cxMetalR", "cxLockR"]);
  const sb = {
    cxAssistL: { x: 5, y: 55, w: 14, h: 24 }, cxMetalL: { x: 6, y: 56, w: 12, h: 21 }, cxLockL: { x: 10, y: 63, w: 4, h: 7 },
    cxeAssistL: { x: 4, y: 54, w: 16, h: 28 }, cxeMetalL: { x: 6, y: 57, w: 12, h: 20 }, cxeOverL: { x: 5, y: 56, w: 14, h: 24 }, cxeLockL: { x: 11, y: 64, w: 3, h: 6 },
  };
  const ex = assemblyBoxes("CX_EXPAND", sb, "L", { x: 50, y: 70 });
  assert.deepEqual(ex.map((b) => b.piece), ["assist", "metal", "over", "lock"]);
  assert.deepEqual(ex.map((b) => b.w), [16, 12, 14, 3], "CX Expand sizes, not the CX ones");
  assert.deepEqual(assemblyBoxes("CX", sb, "L", { x: 50, y: 70 }).map((b) => b.w), [14, 12, 4]);
});

test("assembly operations: move/scale keep the montage; copies touch only the target system and side", () => {
  const f = { a: { x: 10, y: 50, w: 20, h: 30 }, m: { x: 12, y: 52, w: 16, h: 24 }, l: { x: 18, y: 61, w: 4, h: 6 }, other: { x: 70, y: 50, w: 10, h: 10 } };
  const ks = ["a", "m", "l"];
  const mv = moveAssembly(f, ks, 5, -2);
  assert.deepEqual(Object.keys(mv), ks, "only the assembly's keys");
  assert.deepEqual([mv.a.x - f.a.x, mv.l.x - f.l.x, mv.l.y - f.l.y], [5, 5, -2]);
  const b0 = bbox(f, ks);
  const sc = scaleAssembly(f, ks, 1.5);
  const b1 = bbox(sc, ks);
  assert.ok(Math.abs(b1.cx - b0.cx) < 0.01 && Math.abs(b1.cy - b0.cy) < 0.01, "common centre kept");
  assert.ok(Math.abs(b1.w - b0.w * 1.5) < 0.02 && Math.abs(b1.h - b0.h * 1.5) < 0.02);
  // Offsets between pieces scale by the same factor (no piece comes apart).
  assert.ok(Math.abs((sc.l.x - sc.a.x) - (f.l.x - f.a.x) * 1.5) < 0.02);
  assert.ok(Math.abs(sc.m.w / sc.m.h - f.m.w / f.m.h) < 0.01, "piece proportion kept");
  // Mirror to the other side: mirrored position of the set, same sizes and montage.
  const mr = mirrorAssembly(f, ks, ["A", "M", "L"]);
  const bm = bbox(mr, ["A", "M", "L"]);
  assert.ok(Math.abs(bm.x - (100 - b0.x - b0.w)) < 0.01, "set mirrored");
  assert.equal(mr.L.x - mr.A.x, f.l.x - f.a.x, "montage NOT mirrored (piece images aren't)");
  assert.deepEqual([mr.A.w, mr.L.h], [20, 6]);
  assert.ok(!("other" in mr) && !("a" in mr), "nothing else touched");
  const cp = copyBoxes(f, [["a", "ea"], ["m", "eo"]]);
  assert.deepEqual(cp, { ea: f.a, eo: f.m });
  cp.ea.x = 99;
  assert.equal(f.a.x, 10, "copies are independent");
});
