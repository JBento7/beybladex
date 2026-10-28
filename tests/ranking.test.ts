import { test } from "node:test";
import assert from "node:assert/strict";
import { sortRanking, rankingPreview } from "../src/lib/rankingMath.ts";

const e = (id: string, name: string, points: number) => ({ id, name, points, wins: 0, losses: 0 });

test("orders by points, ties alphabetically, drops players with 0 points", () => {
  const r = sortRanking([e("a", "Zé", 50), e("b", "Ana", 100), e("c", "Bia", 50), e("d", "Caio", 0)]);
  assert.deepEqual(r.map((x) => x.id), ["b", "c", "a"]);
});

test("user outside the top 5 gets a separate row with the real position", () => {
  const list = sortRanking(Array.from({ length: 8 }, (_, i) => e(`p${i}`, `P${i}`, 100 - i * 10)));
  const prev = rankingPreview(list, "p6");
  assert.equal(prev.top.length, 5);
  assert.ok(!prev.top.some((r) => r.id === "p6")); // never inserted into the top 5
  assert.equal(prev.me?.position, 7);
  assert.equal(rankingPreview(list, "p2").me, null); // already visible in the top 5
  assert.equal(rankingPreview(list, "nobody").me, null);
  assert.equal(rankingPreview([], "p1").top.length, 0); // empty ranking
});

test("equal points AND equal nicknames still have one stable order", () => {
  const a = { id: "b2", name: "Igual", points: 10, wins: 0, losses: 0 };
  const b = { id: "a1", name: "Igual", points: 10, wins: 0, losses: 0 };
  assert.deepEqual(sortRanking([a, b]).map((x) => x.id), ["a1", "b2"]);
  assert.deepEqual(sortRanking([b, a]).map((x) => x.id), ["a1", "b2"]);
});
