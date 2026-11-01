-- How an event's matches are followed (docs/MODO-ARBITRAGEM.md):
-- 'ARENA' (judge panel drives the arena telões) or 'JUDGE_ONLY' (judge's
-- device only, nothing broadcast, no deck order required).
-- Additive only: every existing event becomes 'ARENA', its current behavior.
-- No match, deck order or trio is touched.
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "displayMode" TEXT NOT NULL DEFAULT 'ARENA';
