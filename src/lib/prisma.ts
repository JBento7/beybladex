import { PrismaClient } from "@prisma/client";

// On serverless (Vercel) each function instance opens its own pool. With
// interactive transactions a connection_limit of 1 quickly deadlocks/times out
// ("Timed out fetching a new connection from the connection pool"). Raise the
// pool size and timeout unless the URL already sets higher values. Override with
// DB_CONNECTION_LIMIT / DB_POOL_TIMEOUT if your database can't take the default.
function buildDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    const wantLimit = parseInt(process.env.DB_CONNECTION_LIMIT ?? "5", 10);
    const wantTimeout = parseInt(process.env.DB_POOL_TIMEOUT ?? "20", 10);

    const curLimit = parseInt(url.searchParams.get("connection_limit") ?? "0", 10);
    if (!curLimit || curLimit < wantLimit) url.searchParams.set("connection_limit", String(wantLimit));

    const curTimeout = parseInt(url.searchParams.get("pool_timeout") ?? "0", 10);
    if (!curTimeout || curTimeout < wantTimeout) url.searchParams.set("pool_timeout", String(wantTimeout));

    return url.toString();
  } catch {
    return raw;
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const databaseUrl = buildDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["query", "error"],
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
