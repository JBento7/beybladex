-- Reduel (docs/REDUEL.md): history of repeated launches + the telão signal.
-- Additive only: no existing row, point, set or result is changed.
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "reduelAt" TIMESTAMP(3);
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "reduelKey" TEXT;

CREATE TABLE IF NOT EXISTS "MatchReduel" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "opId" TEXT NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "battle" INTEGER NOT NULL,
    "attempt" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchReduel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MatchReduel_opId_key" ON "MatchReduel"("opId");
CREATE INDEX IF NOT EXISTS "MatchReduel_matchId_setNumber_battle_idx" ON "MatchReduel"("matchId", "setNumber", "battle");
DO $$ BEGIN
  ALTER TABLE "MatchReduel" ADD CONSTRAINT "MatchReduel_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
