-- "Pontuação dobrada": official events that award twice the ranking points.
-- Additive only: existing events stay false; no stored ranking points change.
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "doubleRankingPoints" BOOLEAN NOT NULL DEFAULT false;
