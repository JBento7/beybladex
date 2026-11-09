-- Official correction of a tournament result (docs/RESULTADO-OFICIAL.md).
-- Additive only: existing events keep NULL (result from the matches).
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "officialResult" JSONB;
