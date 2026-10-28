// The trigger SQL used by /api/migrate (TS array) and by migrations/tests
// (.sql file) must declare the same triggers and functions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STATE_VERSION_TRIGGER_SQL } from "../src/lib/sql/stateVersionTriggers.ts";

test("state version trigger SQL is in sync", () => {
  const file = readFileSync("prisma/sql/state_version_triggers.sql", "utf8");
  const names = (src: string) => [...src.matchAll(/CREATE (?:OR REPLACE FUNCTION|TRIGGER) (\w+)/g)].map((m) => m[1]).sort();
  assert.deepEqual(names(STATE_VERSION_TRIGGER_SQL.join("\n")), names(file));
  assert.equal(names(file).length, 16);
});
