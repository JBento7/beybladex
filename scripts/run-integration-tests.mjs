// Runs tests/integration/* against a DISPOSABLE database given in
// TEST_DATABASE_URL. Refuses to run against the app's DATABASE_URL so a
// production/development database is never touched. Pushes the schema first.
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const url = process.env.TEST_DATABASE_URL;
if (!url) { console.error("Defina TEST_DATABASE_URL apontando para um banco descartável."); process.exit(1); }
const envFile = existsSync(".env") ? readFileSync(".env", "utf8") : "";
const appUrl = process.env.DATABASE_URL || (envFile.match(/^DATABASE_URL=["']?([^"'\n]+)/m) || [])[1];
if (appUrl && appUrl === url) { console.error("TEST_DATABASE_URL não pode ser o mesmo banco da aplicação."); process.exit(1); }
if (/vercel|supabase|neon|amazonaws|pooler/i.test(url)) { console.error("TEST_DATABASE_URL parece um banco hospedado. Use um banco local descartável."); process.exit(1); }

const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url };
execSync("npx prisma db push --skip-generate --accept-data-loss", { stdio: "inherit", env });
execSync('node --import tsx --test --test-concurrency=1 "tests/integration/*.int.test.ts"', { stdio: "inherit", env });
