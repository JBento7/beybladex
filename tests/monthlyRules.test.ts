// Monthly ranking rules (lib/monthlyRules): São Paulo calendar, tournament
// month, rule tables, deterministic ordering, doubled points.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addMonths, currentMonth, isMonth, monthBounds, monthInSaoPaulo, monthLabel, monthOfTournament, parsePointsTable,
  pointsForPlacement, sortMonthly, DEFAULT_POINTS_TABLE, type MonthlyEntry,
} from "../src/lib/monthlyRules.ts";

test("months follow the São Paulo calendar", () => {
  // 23:30 in São Paulo on Oct 31 = 02:30 UTC on Nov 1 → still October.
  assert.equal(monthInSaoPaulo(new Date("2026-11-01T02:30:00Z")), "2026-10");
  assert.equal(monthInSaoPaulo(new Date("2026-11-01T03:00:00Z")), "2026-11");
  assert.equal(currentMonth(new Date("2027-01-01T02:59:59Z")), "2026-12"); // New Year's Eve, before midnight in Brasília
  const b = monthBounds("2026-11");
  assert.equal(b.instantFrom.toISOString(), "2026-11-01T03:00:00.000Z");
  assert.equal(b.instantTo.toISOString(), "2026-12-01T03:00:00.000Z");
  assert.equal(b.wallFrom.toISOString(), "2026-11-01T00:00:00.000Z");
});

test("tournament month: start date (wall clock) or, without it, the creation date", () => {
  // startDate is the wall time stored as UTC: 30/11 22:00 in Brasília → November.
  assert.equal(monthOfTournament({ startDate: new Date("2026-11-30T22:00:00Z"), createdAt: new Date("2026-10-02T12:00:00Z") }), "2026-11");
  assert.equal(monthOfTournament({ startDate: null, createdAt: new Date("2026-11-01T01:00:00Z") }), "2026-10");
});

test("month helpers", () => {
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.equal(addMonths("2026-05", -17), "2024-12");
  assert.ok(isMonth("2026-10"));
  for (const bad of ["2026-13", "2026-1", "26-10", "2026-00", 202610, null]) assert.equal(isMonth(bad), false, String(bad));
  assert.equal(monthLabel("2026-03"), "março de 2026");
});

test("points tables: 1–32 placements, integers 0–10000", () => {
  assert.deepEqual(parsePointsTable([100, 70, 50, 30, 10]), { ok: true, table: [100, 70, 50, 30, 10] });
  assert.deepEqual(parsePointsTable(["200", "0"]), { ok: true, table: [200, 0] });
  assert.equal(parsePointsTable(Array(32).fill(1)).ok, true);
  for (const bad of [[], Array(33).fill(1), [10001], [-1], [1.5], ["x"], "100", null]) assert.equal(parsePointsTable(bad).ok, false, JSON.stringify(bad));
  assert.deepEqual([...DEFAULT_POINTS_TABLE], [100, 70, 50, 30, 10]);
});

test("doubled events multiply the event's table once; outside the table → 0", () => {
  const t = [200, 100, 50];
  assert.equal(pointsForPlacement(t, 0, 2), 400);
  assert.equal(pointsForPlacement(t, 2, 1), 50);
  assert.equal(pointsForPlacement(t, 3, 2), 0);
  assert.equal(pointsForPlacement(t, 0, 2, false), 0);
});

const e = (id: string, name: string, points: number, wins = 0): MonthlyEntry => ({ id, name, avatarUrl: null, points, tournamentPoints: points, adjustmentPoints: 0, wins, losses: 0 });

test("ordering: points → (wins) → nickname → id; zero totals are left out", () => {
  const list = [e("c", "Beto", 100, 1), e("a", "Ana", 100, 3), e("b", "Ana", 100, 3), e("z", "Zé", 0)];
  assert.deepEqual(sortMonthly(list, "NICKNAME").map((r) => r.id), ["a", "b", "c"]);
  assert.deepEqual(sortMonthly([e("c", "Beto", 100, 5), e("a", "Ana", 100, 1)], "WINS").map((r) => r.id), ["c", "a"]);
  assert.deepEqual(sortMonthly([e("c", "Beto", 100, 5), e("a", "Ana", 100, 1)], "NICKNAME").map((r) => r.id), ["a", "c"]);
  // Same input in any order → same output.
  assert.deepEqual(sortMonthly([...list].reverse(), "NICKNAME").map((r) => r.id), ["a", "b", "c"]);
});
