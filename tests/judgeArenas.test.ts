// Judge "Minhas partidas" by arena (lib/judgeArenas).
import { test } from "node:test";
import assert from "node:assert/strict";
import { arenaKey, groupByArena, type ArenaMatch } from "../src/lib/judgeArenas.ts";

const m = (id: string, tournamentId: string, arena: number | null, status: string, judgeId: string | null = null): ArenaMatch =>
  ({ id, tournamentId, tournamentName: tournamentId === "t1" ? "Campeonato LBL" : "Copa B", arena, status, judgeId });

test("groups by tournament + arena; same arena number of two events never mixed", () => {
  const g = groupByArena([m("a", "t1", 2, "PENDING"), m("b", "t2", 2, "PENDING"), m("c", "t1", 2, "IN_PROGRESS")], "me");
  assert.deepEqual(g.map((x) => [x.key, x.live, x.waiting]), [["t1~2", 1, 1], ["t2~2", 0, 1]]);
});

test("arenas in numeric order (10 after 2), 'Sem arena definida' last", () => {
  const g = groupByArena([m("a", "t1", 10, "PENDING"), m("b", "t1", null, "PENDING"), m("c", "t1", 2, "PENDING"), m("d", "t1", 1, "PENDING")], "me");
  assert.deepEqual(g.map((x) => x.arena), [1, 2, 10, null]);
  assert.equal(arenaKey("t1", null), "t1~sem");
});

test("inside an arena: mine vs others; in progress first, call order kept", () => {
  const g = groupByArena([
    m("p1", "t1", 1, "PENDING", "me"), m("x1", "t1", 1, "PENDING"), m("l1", "t1", 1, "IN_PROGRESS", "me"),
    m("p2", "t1", 1, "PENDING", "me"), m("x2", "t1", 1, "IN_PROGRESS", "other"),
  ], "me")[0];
  assert.deepEqual(g.mine.map((x) => x.id), ["l1", "p1", "p2"]);
  assert.deepEqual(g.others.map((x) => x.id), ["x2", "x1"]);
  assert.equal(g.live + g.waiting, 5);
});
