// Automatic migrations on deploy (scripts/deploy-migrations.mjs): when they
// run, and which pending migrations are refused.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-expect-error — plain .mjs script, no type declarations
import { shouldMigrate, destructiveStatements, listMigrations, BASELINE } from "../scripts/deploy-migrations.mjs";

test("only production deploys migrate (previews never); kill switch and opt-in", () => {
  assert.equal(shouldMigrate({ VERCEL_ENV: "production" }), true);
  assert.equal(shouldMigrate({ VERCEL_ENV: "preview" }), false);
  assert.equal(shouldMigrate({ VERCEL_ENV: "development" }), false);
  assert.equal(shouldMigrate({}), false); // CI / local build
  assert.equal(shouldMigrate({ VERCEL_ENV: "production", MIGRATE_ON_BUILD: "0" }), false);
  assert.equal(shouldMigrate({ VERCEL_ENV: "preview", MIGRATE_ON_BUILD: "1" }), true);
});

test("destructive statements are detected; trigger bodies and constraint swaps are not", () => {
  assert.deepEqual(destructiveStatements('ALTER TABLE "A" DROP COLUMN "x";'), ["DROP de tabela/coluna/tipo"]);
  assert.deepEqual(destructiveStatements('DROP TABLE "A";'), ["DROP de tabela/coluna/tipo"]);
  assert.deepEqual(destructiveStatements('TRUNCATE "A";'), ["TRUNCATE"]);
  assert.deepEqual(destructiveStatements('DELETE FROM "User" WHERE 1=1;'), ["DELETE"]);
  assert.deepEqual(destructiveStatements('UPDATE "Tournament" SET "x" = 1;'), ["UPDATE de dados"]);
  assert.deepEqual(destructiveStatements('ALTER TABLE "A" ALTER COLUMN "b" TYPE TEXT;'), ["mudança de tipo de coluna"]);
  assert.deepEqual(destructiveStatements('ALTER TABLE "A" DROP CONSTRAINT IF EXISTS "f"; ALTER TABLE "A" ADD CONSTRAINT "f" FOREIGN KEY ("x") REFERENCES "B"("id") ON DELETE CASCADE ON UPDATE CASCADE;'), []);
  assert.deepEqual(destructiveStatements("CREATE OR REPLACE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE \"T\" SET v = v + 1; RETURN NULL; END $$;"), []);
  assert.deepEqual(destructiveStatements("-- DELETE FROM x (comment)\nSELECT 1;"), []);
});

test("every migration in the repository is accepted by the automatic deploy", () => {
  const all = listMigrations();
  assert.equal(all[0], BASELINE);
  for (const m of all) assert.deepEqual(destructiveStatements(readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8")), [], m);
});
