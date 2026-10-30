// Order of the home carousel (lib/featuredOrder).
import { test } from "node:test";
import assert from "node:assert/strict";
import { sortFeatured } from "../src/lib/featuredOrder.ts";

const ev = (id: string, status: string, startDate: string | null, extra: { isOfficial?: boolean; createdAt?: string } = {}) => ({
  id, status, startDate, isOfficial: extra.isOfficial ?? true, createdAt: extra.createdAt ?? "2026-10-01T12:00:00.000Z",
});

test("in progress first (official first), then sign-ups by soonest date, undated last", () => {
  const list = [
    ev("reg-undated", "REGISTRATION", null),
    ev("reg-dec", "REGISTRATION", "2026-12-05T14:00:00.000Z"),
    ev("live-casual", "IN_PROGRESS", "2026-10-30T14:00:00.000Z", { isOfficial: false }),
    ev("reg-nov", "REGISTRATION", "2026-11-08T14:00:00.000Z"),
    ev("live-official", "IN_PROGRESS", "2026-10-29T14:00:00.000Z"),
    ev("reg-nov-early", "REGISTRATION", "2026-11-08T10:00:00.000Z"),
  ];
  assert.deepEqual(sortFeatured(list).map((e) => e.id), ["live-official", "live-casual", "reg-nov-early", "reg-nov", "reg-dec", "reg-undated"]);
});

test("deterministic ties: newest creation first, then id; input order doesn't matter", () => {
  const a = ev("b", "REGISTRATION", null, { createdAt: "2026-10-02T00:00:00.000Z" });
  const b = ev("a", "REGISTRATION", null, { createdAt: "2026-10-02T00:00:00.000Z" });
  const c = ev("c", "REGISTRATION", null, { createdAt: "2026-10-05T00:00:00.000Z" });
  assert.deepEqual(sortFeatured([a, b, c]).map((e) => e.id), ["c", "a", "b"]);
  assert.deepEqual(sortFeatured([c, b, a]).map((e) => e.id), ["c", "a", "b"]);
  assert.deepEqual(sortFeatured([]), []);
});
