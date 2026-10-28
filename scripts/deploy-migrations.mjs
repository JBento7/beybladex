// Automatic database migrations during the Vercel build (docs/OPERACAO.md §1).
//
// Runs BEFORE `next build`, so the database is migrated before the new code
// goes live (migrations are additive, so the old code keeps working with the
// migrated database). If anything fails, the build fails: Vercel keeps the
// current deployment online and nothing half-done is published.
//
// When it runs:
//  - VERCEL_ENV=production → yes (Preview deployments NEVER migrate: they may
//    point at the production database);
//  - MIGRATE_ON_BUILD=1 → yes anywhere (e.g. a staging project with its own DB);
//  - MIGRATE_ON_BUILD=0 → never (kill switch).
//
// Safety:
//  - first adoption: a database created before versioned migrations (has the
//    app tables but no _prisma_migrations) gets the baseline marked as applied
//    (it already has that schema); the additive migrations then run;
//  - pending migrations that DROP/TRUNCATE/DELETE data are refused unless
//    ALLOW_DESTRUCTIVE_MIGRATION=1 is set for that deploy;
//  - optional MIGRATE_BACKUP_COMMAND runs first (e.g. a call to the database
//    provider's API creating a backup/branch); if it fails, nothing is migrated;
//  - MIGRATE_DATABASE_URL (optional) = a DIRECT connection for migrations when
//    DATABASE_URL goes through a pooler (pgbouncer can't run migrations).
//  - `prisma migrate deploy` takes a database lock, so two simultaneous
//    deploys can't migrate at the same time.
// No secrets are printed: URLs are never logged.
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const BASELINE = "20261028000000_baseline";
const MIGRATIONS_DIR = new URL("../prisma/migrations/", import.meta.url).pathname;

export function shouldMigrate(env) {
  if (env.MIGRATE_ON_BUILD === "0") return false;
  if (env.MIGRATE_ON_BUILD === "1") return true;
  return env.VERCEL_ENV === "production";
}

/** Statements that destroy or rewrite data (constraint/trigger drops are fine). */
export function destructiveStatements(sql) {
  const found = [];
  // Ignore comments and function/trigger bodies ($$ … $$): an UPDATE inside a
  // trigger runs later, per row, not while migrating.
  const body = sql.replace(/--.*$/gm, "").replace(/\$\$[\s\S]*?\$\$/g, "$$$$");
  const rules = [
    [/\bDROP\s+(TABLE|COLUMN|SCHEMA|DATABASE|TYPE)\b/i, "DROP de tabela/coluna/tipo"],
    [/\bTRUNCATE\b/i, "TRUNCATE"],
    [/(^|;|\$q\$)\s*DELETE\s+FROM\b/im, "DELETE"],
    [/(^|;|\$q\$)\s*UPDATE\s+"?\w+"?\s+(\w+\s+)?SET\b/im, "UPDATE de dados"],
    [/\bALTER\s+COLUMN\s+"?\w+"?\s+(SET\s+DATA\s+)?TYPE\b/i, "mudança de tipo de coluna"],
  ];
  for (const [re, label] of rules) if (re.test(body)) found.push(label);
  return found;
}

export function listMigrations(dir = MIGRATIONS_DIR) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, "migration.sql")))
    .map((d) => d.name)
    .sort();
}

const log = (m) => console.log(`[migrations] ${m}`);

async function dbState(url) {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const [{ m, t }] = await prisma.$queryRawUnsafe(`SELECT to_regclass('public._prisma_migrations')::text AS m, to_regclass('public."Tournament"')::text AS t`);
    let applied = [];
    if (m) applied = (await prisma.$queryRawUnsafe(`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)).map((r) => r.migration_name);
    return { hasMigrationsTable: !!m, hasAppTables: !!t, applied };
  } finally {
    await prisma.$disconnect();
  }
}

export async function run(env = process.env) {
  if (!shouldMigrate(env)) {
    log(env.MIGRATE_ON_BUILD === "0"
      ? "desligado por MIGRATE_ON_BUILD=0."
      : `ignorado (VERCEL_ENV=${env.VERCEL_ENV ?? "—"}; migrações automáticas só em produção ou com MIGRATE_ON_BUILD=1).`);
    return { migrated: false };
  }
  const url = env.MIGRATE_DATABASE_URL || env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL (ou MIGRATE_DATABASE_URL) ausente: não é possível migrar.");
  const cmdEnv = { ...process.env, ...env, DATABASE_URL: url };
  const sh = (cmd) => execSync(cmd, { stdio: "inherit", env: cmdEnv });

  const state = await dbState(url);
  const all = listMigrations();
  const adopting = !state.hasMigrationsTable && state.hasAppTables;
  const alreadyApplied = new Set(adopting ? [BASELINE] : state.applied);
  const pending = all.filter((m) => !alreadyApplied.has(m));
  log(adopting ? "banco existente sem histórico de migrações: a base será marcada como aplicada." : `aplicadas: ${state.applied.length}, pendentes: ${pending.length}.`);
  if (pending.length === 0 && !adopting) { log("nada a fazer."); return { migrated: false, pending: [] }; }

  // Refuse destructive changes unless explicitly allowed for this deploy.
  const blocked = pending
    .filter((m) => m !== BASELINE || state.hasAppTables)
    .map((m) => ({ m, issues: destructiveStatements(readFileSync(join(MIGRATIONS_DIR, m, "migration.sql"), "utf8")) }))
    .filter((x) => x.issues.length);
  if (blocked.length && env.ALLOW_DESTRUCTIVE_MIGRATION !== "1") {
    for (const b of blocked) log(`BLOQUEADA ${b.m}: ${b.issues.join(", ")}`);
    throw new Error("Migração destrutiva pendente. Revise, faça backup e defina ALLOW_DESTRUCTIVE_MIGRATION=1 apenas para este deploy.");
  }

  if (env.MIGRATE_BACKUP_COMMAND) {
    log("executando MIGRATE_BACKUP_COMMAND antes de migrar…");
    execSync(env.MIGRATE_BACKUP_COMMAND, { stdio: "inherit", env: cmdEnv, shell: "/bin/sh" });
  }

  if (adopting) sh(`npx prisma migrate resolve --applied ${BASELINE}`);
  sh("npx prisma migrate deploy");
  log(`concluído: ${pending.length} migração(ões) aplicada(s)${adopting ? " (base adotada)" : ""}.`);
  return { migrated: true, pending, adopted: adopting };
}

// CLI: `node scripts/deploy-migrations.mjs` (used by `npm run build`).
if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((e) => {
    const msg = String(e?.message ?? e).split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 3).join(" ");
    console.error(`[migrations] FALHOU: ${msg}`);
    console.error("[migrations] O deploy foi interrompido; a versão atual continua no ar. Veja docs/OPERACAO.md §1.");
    process.exit(1);
  });
}
