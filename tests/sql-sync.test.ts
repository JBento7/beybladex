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

test("versioned migrations stay in sync with their sources", async () => {
  // Triggers: the migration is a copy of prisma/sql/state_version_triggers.sql.
  assert.equal(
    readFileSync("prisma/migrations/20261028000100_state_version_triggers/migration.sql", "utf8"),
    readFileSync("prisma/sql/state_version_triggers.sql", "utf8"),
  );
  // Schema compat: generated from /api/migrate's DDL list.
  const { execFileSync } = await import("node:child_process");
  execFileSync(process.execPath, ["scripts/gen-compat-migration.mjs", "--check"], { stdio: "pipe" });
});

test("schema compat migration only adds — never rewrites or drops data", () => {
  const sql = readFileSync("prisma/migrations/20261028000050_schema_compat/migration.sql", "utf8");
  // No statement that starts with UPDATE/DELETE/TRUNCATE (FK clauses such as
  // "ON UPDATE CASCADE" are fine), and no DROP TABLE/COLUMN.
  assert.doesNotMatch(sql, /(^|\$q\$)\s*(UPDATE|DELETE|TRUNCATE)\b/im);
  assert.doesNotMatch(sql, /\bDROP\s+(TABLE|COLUMN)\b/i);
  // The data fixes removed from /api/migrate live only in the manual file.
  const route = readFileSync("src/app/api/migrate/route.ts", "utf8");
  assert.doesNotMatch(route, /sql: `\s*(UPDATE|DELETE)\b/);
});
