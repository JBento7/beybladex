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
//  - transaction poolers can't run migrations: a Supabase :6543 / Neon pooled
//    DATABASE_URL is switched to the session/direct connection automatically;
//    MIGRATE_DATABASE_URL (optional) overrides it (see migrationUrl);
//  - a migration left failed by an earlier attempt is retried (all migrations
//    are idempotent), so a broken deploy can simply be redeployed.
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

/**
 * Connection used for migrations. `prisma migrate` needs a session-level
 * connection; transaction poolers (pgbouncer, Supabase :6543) make it hang.
 *  - MIGRATE_DATABASE_URL wins when set;
 *  - Supabase transaction pooler (*.pooler.supabase.com:6543) → the session
 *    pooler on the same host (:5432), same credentials;
 *  - Neon pooled host (ep-…-pooler.…) → the direct host;
 *  - any other pgbouncer URL → refused with instructions (it would hang).
 * Returns { url, note } — note is safe to log (no credentials).
 */
export function migrationUrl(env) {
  if (env.MIGRATE_DATABASE_URL) return { url: env.MIGRATE_DATABASE_URL, note: "usando MIGRATE_DATABASE_URL." };
  if (!env.DATABASE_URL) return { url: null, note: null };
  let u;
  try { u = new URL(env.DATABASE_URL); } catch { return { url: env.DATABASE_URL, note: null }; }
  const drop = () => { u.searchParams.delete("pgbouncer"); u.searchParams.delete("connection_limit"); };
  if (/\.pooler\.supabase\.com$/i.test(u.hostname) && u.port === "6543") {
    u.port = "5432";
    drop();
    return { url: u.toString(), note: "DATABASE_URL usa o pooler de transação do Supabase (6543); migrando pelo pooler de sessão (5432)." };
  }
  if (/-pooler\./i.test(u.hostname) && /\.neon\.tech$/i.test(u.hostname)) {
    u.hostname = u.hostname.replace(/-pooler\./i, ".");
    drop();
    return { url: u.toString(), note: "DATABASE_URL usa o pooler do Neon; migrando pela conexão direta." };
  }
  if (u.searchParams.get("pgbouncer") === "true" || u.port === "6543") {
    throw new Error("DATABASE_URL passa por um pooler de transação (pgbouncer), que não roda migrações. Defina MIGRATE_DATABASE_URL com a conexão direta ou de sessão.");
  }
  return { url: env.DATABASE_URL, note: null };
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
    let failed = [];
    if (m) {
      const rows = await prisma.$queryRawUnsafe(`SELECT migration_name, finished_at IS NOT NULL AS done FROM _prisma_migrations WHERE rolled_back_at IS NULL`);
      applied = rows.filter((r) => r.done).map((r) => r.migration_name);
      failed = rows.filter((r) => !r.done).map((r) => r.migration_name);
    }
    return { hasMigrationsTable: !!m, hasAppTables: !!t, applied, failed };
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
  const { url, note } = migrationUrl(env);
  if (!url) throw new Error("DATABASE_URL (ou MIGRATE_DATABASE_URL) ausente: não é possível migrar.");
  if (note) log(note);
  const cmdEnv = { ...process.env, ...env, DATABASE_URL: url };
  // A hung connection must fail the build, not stall it until Vercel's limit.
  const sh = (cmd) => execSync(cmd, { stdio: "inherit", env: cmdEnv, timeout: 10 * 60_000 });

  const state = await dbState(url);
  const all = listMigrations();
  // Existing database without the baseline recorded (never adopted, or an
  // earlier adoption was interrupted): it already has that schema.
  const adopting = state.hasAppTables && !state.applied.includes(BASELINE);
  const alreadyApplied = new Set([...state.applied, ...(adopting ? [BASELINE] : [])]);
  const pending = all.filter((m) => !alreadyApplied.has(m));
  log(adopting
    ? "banco existente sem a base registrada: a base será marcada como aplicada."
    : `aplicadas: ${state.applied.length}, pendentes: ${pending.length}.`);
  if (state.failed.length) log(`tentativa anterior falhou em: ${state.failed.join(", ")} — será reaplicada (as migrações são idempotentes).`);
  if (pending.length === 0 && !adopting && !state.failed.length) { log("nada a fazer."); return { migrated: false, pending: [] }; }

  // Refuse destructive changes unless explicitly allowed for this deploy.
  const blocked = pending
    .filter((m) => m !== BASELINE)
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

  // A failed attempt blocks `migrate deploy` (P3009). Every migration here is
  // idempotent (IF NOT EXISTS / guarded blocks), so it is safe to retry it.
  for (const m of state.failed) sh(`npx prisma migrate resolve --rolled-back ${m}`);
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
