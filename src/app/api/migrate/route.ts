export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// One-time migration endpoint to apply missing schema columns
// Call: GET /api/migrate
export async function GET() {
  const results: Record<string, string> = {};

  const migrations = [
    {
      name: "TournamentParticipant.beyblade1",
      sql: `ALTER TABLE "TournamentParticipant" ADD COLUMN IF NOT EXISTS "beyblade1" TEXT`,
    },
    {
      name: "TournamentParticipant.beyblade2",
      sql: `ALTER TABLE "TournamentParticipant" ADD COLUMN IF NOT EXISTS "beyblade2" TEXT`,
    },
    {
      name: "TournamentParticipant.beyblade3",
      sql: `ALTER TABLE "TournamentParticipant" ADD COLUMN IF NOT EXISTS "beyblade3" TEXT`,
    },
    {
      name: "MatchPoint.beybladeId",
      sql: `ALTER TABLE "MatchPoint" ADD COLUMN IF NOT EXISTS "beybladeId" TEXT`,
    },
    {
      name: "MatchPoint.setId",
      sql: `ALTER TABLE "MatchPoint" ADD COLUMN IF NOT EXISTS "setId" TEXT`,
    },
    {
      name: "SetStatus enum",
      sql: `DO $$ BEGIN CREATE TYPE "SetStatus" AS ENUM ('IN_PROGRESS', 'FINISHED'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    },
    {
      name: "MatchSet table",
      sql: `CREATE TABLE IF NOT EXISTS "MatchSet" (
        "id" TEXT NOT NULL,
        "matchId" TEXT NOT NULL,
        "setNumber" INTEGER NOT NULL,
        "player1Points" INTEGER NOT NULL DEFAULT 0,
        "player2Points" INTEGER NOT NULL DEFAULT 0,
        "winnerId" TEXT,
        "status" "SetStatus" NOT NULL DEFAULT 'IN_PROGRESS',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "MatchSet_pkey" PRIMARY KEY ("id")
      )`,
    },
    {
      name: "MatchSet.matchId FK",
      sql: `DO $$ BEGIN ALTER TABLE "MatchSet" ADD CONSTRAINT "MatchSet_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$`,
    },
    {
      name: "MatchSet.winnerId FK",
      sql: `DO $$ BEGIN ALTER TABLE "MatchSet" ADD CONSTRAINT "MatchSet_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$`,
    },
    {
      name: "MatchPoint.beybladeId FK",
      sql: `DO $$ BEGIN ALTER TABLE "MatchPoint" ADD CONSTRAINT "MatchPoint_beybladeId_fkey" FOREIGN KEY ("beybladeId") REFERENCES "Beyblade"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$`,
    },
    {
      name: "MatchPoint.setId FK",
      sql: `DO $$ BEGIN ALTER TABLE "MatchPoint" ADD CONSTRAINT "MatchPoint_setId_fkey" FOREIGN KEY ("setId") REFERENCES "MatchSet"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$`,
    },
    {
      name: "Beyblade table",
      sql: `CREATE TABLE IF NOT EXISTS "Beyblade" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "model" TEXT,
        "wins" INTEGER NOT NULL DEFAULT 0,
        "losses" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Beyblade_pkey" PRIMARY KEY ("id")
      )`,
    },
    {
      name: "Beyblade.userId FK",
      sql: `DO $$ BEGIN ALTER TABLE "Beyblade" ADD CONSTRAINT "Beyblade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$`,
    },
    {
      name: "Tournament.prize",
      sql: `ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "prize" TEXT`,
    },
    {
      name: "Tournament.deckType",
      sql: `DO $$ BEGIN CREATE TYPE "DeckType" AS ENUM ('SOLO', 'THREE_ON_THREE'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    },
    {
      name: "Tournament.deckType column",
      sql: `ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "deckType" "DeckType" NOT NULL DEFAULT 'SOLO'`,
    },
    {
      name: "TournamentParticipant.placement",
      sql: `ALTER TABLE "TournamentParticipant" ADD COLUMN IF NOT EXISTS "placement" INTEGER`,
    },
  ];

  for (const migration of migrations) {
    try {
      await prisma.$executeRawUnsafe(migration.sql);
      results[migration.name] = "OK";
    } catch (e) {
      results[migration.name] = String(e);
    }
  }

  return NextResponse.json(results);
}
