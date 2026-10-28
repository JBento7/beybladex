-- Deck format "3 on 3 + 1 reserva" (docs/DECK-3ON3-RESERVA.md).
-- Additive only: a new enum value, nullable columns and a new table. Existing
-- registrations and events are untouched (no 4th Beyblade is invented).

-- New deck type. (Usable only after this migration commits.)
ALTER TYPE "DeckType" ADD VALUE IF NOT EXISTS 'THREE_ON_THREE_PLUS_ONE';

-- 4th registered Beyblade + snapshot of the deck as registered.
ALTER TABLE "TournamentParticipant" ADD COLUMN IF NOT EXISTS "beyblade4" TEXT;
ALTER TABLE "TournamentParticipant" ADD COLUMN IF NOT EXISTS "deckSnapshot" JSONB;
ALTER TABLE "TournamentParticipant" ADD COLUMN IF NOT EXISTS "deckSnapshotAt" TIMESTAMP(3);

-- Active trio per match and player (revisable until the match is locked).
CREATE TABLE IF NOT EXISTS "MatchTrioSelection" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bey1Id" TEXT NOT NULL,
    "bey2Id" TEXT NOT NULL,
    "bey3Id" TEXT NOT NULL,
    "reserveId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "confirmedAt" TIMESTAMP(3) NOT NULL,
    "confirmedById" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "lockedSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchTrioSelection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MatchTrioSelection_matchId_userId_key" ON "MatchTrioSelection"("matchId", "userId");
CREATE INDEX IF NOT EXISTS "MatchTrioSelection_tournamentId_userId_idx" ON "MatchTrioSelection"("tournamentId", "userId");
DO $$ BEGIN
  ALTER TABLE "MatchTrioSelection" ADD CONSTRAINT "MatchTrioSelection_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
