-- Monthly rankings per league (docs/RANKING-MENSAL.md).
-- Additive only: two new tables and one nullable column. No existing row is
-- changed; finished events keep their stored ranking points.

ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "rankingPointsTable" JSONB;

CREATE TABLE IF NOT EXISTS "RankingPeriod" (
    "id" TEXT NOT NULL,
    "communitySlug" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "pointsTable" JSONB,
    "tiebreak" TEXT,
    "standings" JSONB,
    "championUserId" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RankingPeriod_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RankingPeriod_communitySlug_month_key" ON "RankingPeriod"("communitySlug", "month");

CREATE TABLE IF NOT EXISTS "RankingOperation" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "userId" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RankingOperation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RankingOperation_idempotencyKey_key" ON "RankingOperation"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "RankingOperation_periodId_userId_idx" ON "RankingOperation"("periodId", "userId");
CREATE INDEX IF NOT EXISTS "RankingOperation_requestId_idx" ON "RankingOperation"("requestId");

DO $$ BEGIN
  ALTER TABLE "RankingOperation" ADD CONSTRAINT "RankingOperation_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "RankingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
