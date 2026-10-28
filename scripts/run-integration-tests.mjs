// Runs tests/integration/* against a DISPOSABLE database given in
// TEST_DATABASE_URL. Refuses to run against the app's DATABASE_URL so a
// production/development database is never touched. Rebuilds the database from
// the versioned migrations (prisma/migrations), so every run also validates them.
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const url = process.env.TEST_DATABASE_URL;
if (!url) { console.error("Defina TEST_DATABASE_URL apontando para um banco descartável."); process.exit(1); }
const envFile = existsSync(".env") ? readFileSync(".env", "utf8") : "";
const appUrl = process.env.DATABASE_URL || (envFile.match(/^DATABASE_URL=["']?([^"'\n]+)/m) || [])[1];
if (appUrl && appUrl === url) { console.error("TEST_DATABASE_URL não pode ser o mesmo banco da aplicação."); process.exit(1); }
if (/vercel|supabase|neon|amazonaws|pooler/i.test(url)) { console.error("TEST_DATABASE_URL parece um banco hospedado. Use um banco local descartável."); process.exit(1); }

const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url };
// Disposable database: drop everything and apply every migration from scratch
// (baseline → schema compat → foreign keys → state-version triggers).
execSync("npx prisma migrate reset --force --skip-generate --skip-seed", { stdio: "inherit", env });
// The database must match the schema exactly after the migrations.
execSync("npx prisma migrate diff --from-url \"$DATABASE_URL\" --to-schema-datamodel prisma/schema.prisma --exit-code", { stdio: "inherit", env });
execSync('node --import tsx --test --test-concurrency=1 "tests/integration/*.int.test.ts"', { stdio: "inherit", env });
