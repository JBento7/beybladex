-- Version of a match's score (docs/JUIZ-TELAO.md): bumped by every point, undo
-- and W.O. so the judge panel and the telão can drop late/out-of-order updates.
-- Additive only: existing matches start at 0.
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "scoreVersion" INTEGER NOT NULL DEFAULT 0;
