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
    {
      name: "User.beyblade",
      sql: `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "beyblade" TEXT`,
    },
    {
      name: "MatchPoint.beybladeUsed",
      sql: `ALTER TABLE "MatchPoint" ADD COLUMN IF NOT EXISTS "beybladeUsed" TEXT`,
    },
    {
      name: "User.deleted",
      sql: `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deleted" BOOLEAN NOT NULL DEFAULT false`,
    },
    {
      name: "User.avatarUrl",
      sql: `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT`,
    },
    {
      name: "Beyblade.blade",
      sql: `ALTER TABLE "Beyblade" ADD COLUMN IF NOT EXISTS "blade" TEXT`,
    },
    {
      name: "Beyblade.ratchet",
      sql: `ALTER TABLE "Beyblade" ADD COLUMN IF NOT EXISTS "ratchet" TEXT`,
    },
    {
      name: "Beyblade.bit",
      sql: `ALTER TABLE "Beyblade" ADD COLUMN IF NOT EXISTS "bit" TEXT`,
    },
    {
      name: "PasswordResetToken table",
      sql: `CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "token" TEXT NOT NULL UNIQUE,
        "used" BOOLEAN NOT NULL DEFAULT false,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
      )`,
    },
    {
      name: "PasswordResetToken.userId FK",
      sql: `DO $$ BEGIN ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$`,
    },
    {
      name: "User.emailVerified",
      sql: `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false`,
    },
    {
      name: "EmailVerifyToken table",
      sql: `CREATE TABLE IF NOT EXISTS "EmailVerifyToken" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "token" TEXT NOT NULL UNIQUE,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "EmailVerifyToken_pkey" PRIMARY KEY ("id")
      )`,
    },
    {
      name: "EmailVerifyToken.userId FK",
      sql: `DO $$ BEGIN ALTER TABLE "EmailVerifyToken" ADD CONSTRAINT "EmailVerifyToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$`,
    },
    {
      name: "TournamentParticipant.userId nullable",
      sql: `ALTER TABLE "TournamentParticipant" ALTER COLUMN "userId" DROP NOT NULL`,
    },
    {
      name: "TournamentParticipant.guestName",
      sql: `ALTER TABLE "TournamentParticipant" ADD COLUMN IF NOT EXISTS "guestName" TEXT`,
    },
    {
      name: "TournamentParticipant.beyblade1Name",
      sql: `ALTER TABLE "TournamentParticipant" ADD COLUMN IF NOT EXISTS "beyblade1Name" TEXT`,
    },
    {
      name: "TournamentParticipant.beyblade2Name",
      sql: `ALTER TABLE "TournamentParticipant" ADD COLUMN IF NOT EXISTS "beyblade2Name" TEXT`,
    },
    {
      name: "TournamentParticipant.beyblade3Name",
      sql: `ALTER TABLE "TournamentParticipant" ADD COLUMN IF NOT EXISTS "beyblade3Name" TEXT`,
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
