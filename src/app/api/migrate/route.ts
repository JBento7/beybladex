export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// One-time migration endpoint to apply missing schema columns.
// Restricted to signed-in organizers — it runs destructive DDL.
// Call: GET /api/migrate (while logged in as an ORGANIZER)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

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
      name: "User.isGuest",
      sql: `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isGuest" BOOLEAN NOT NULL DEFAULT false`,
    },
    {
      // Clean up any orphan guest participants created while userId was nullable
      name: "Delete null-userId participants",
      sql: `DELETE FROM "TournamentParticipant" WHERE "userId" IS NULL`,
    },
    {
      name: "Restore TournamentParticipant.userId NOT NULL",
      sql: `ALTER TABLE "TournamentParticipant" ALTER COLUMN "userId" SET NOT NULL`,
    },
    {
      name: "Tournament.isOfficial",
      sql: `ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "isOfficial" BOOLEAN NOT NULL DEFAULT true`,
    },
    {
      name: "User.bladerName",
      sql: `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "bladerName" TEXT`,
    },
    {
      name: "Tournament.arenas",
      sql: `ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "arenas" INTEGER DEFAULT 1`,
    },
    {
      name: "Match.arena",
      sql: `ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "arena" INTEGER`,
    },
    {
      name: "Match.slot",
      sql: `ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "slot" INTEGER`,
    },
    {
      name: "TournamentParticipant.rankingPoints",
      sql: `ALTER TABLE "TournamentParticipant" ADD COLUMN IF NOT EXISTS "rankingPoints" INTEGER NOT NULL DEFAULT 0`,
    },
    {
      name: "Match.isWalkover",
      sql: `ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "isWalkover" BOOLEAN NOT NULL DEFAULT false`,
    },
    {
      name: "AnnouncementType enum",
      sql: `DO $$ BEGIN CREATE TYPE "AnnouncementType" AS ENUM ('NEWS', 'POLL'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    },
    {
      name: "PollType enum",
      sql: `DO $$ BEGIN CREATE TYPE "PollType" AS ENUM ('TEXT', 'CHECKBOX'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    },
    {
      name: "Announcement table",
      sql: `CREATE TABLE IF NOT EXISTS "Announcement" (
        "id" TEXT NOT NULL,
        "type" "AnnouncementType" NOT NULL,
        "title" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "pollType" "PollType",
        "options" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        "active" BOOLEAN NOT NULL DEFAULT true,
        "createdBy" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
      )`,
    },
    {
      name: "Announcement.createdBy FK",
      sql: `DO $$ BEGIN ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$`,
    },
    {
      name: "PollResponse table",
      sql: `CREATE TABLE IF NOT EXISTS "PollResponse" (
        "id" TEXT NOT NULL,
        "announcementId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "answerText" TEXT,
        "selectedOptions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        "validated" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PollResponse_pkey" PRIMARY KEY ("id")
      )`,
    },
    {
      name: "PollResponse.announcementId FK",
      sql: `DO $$ BEGIN ALTER TABLE "PollResponse" ADD CONSTRAINT "PollResponse_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$`,
    },
    {
      name: "PollResponse.userId FK",
      sql: `DO $$ BEGIN ALTER TABLE "PollResponse" ADD CONSTRAINT "PollResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$`,
    },
    {
      name: "PollResponse unique announcementId+userId",
      sql: `DO $$ BEGIN ALTER TABLE "PollResponse" ADD CONSTRAINT "PollResponse_announcementId_userId_key" UNIQUE ("announcementId", "userId"); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    },
    {
      name: "TournamentParticipant.hasPaid",
      sql: `ALTER TABLE "TournamentParticipant" ADD COLUMN IF NOT EXISTS "hasPaid" BOOLEAN NOT NULL DEFAULT false`,
    },
    {
      name: "TournamentParticipant.beybladeInspected",
      sql: `ALTER TABLE "TournamentParticipant" ADD COLUMN IF NOT EXISTS "beybladeInspected" BOOLEAN NOT NULL DEFAULT false`,
    },
    {
      name: "Beyblade.hiddenFromCommunity",
      sql: `ALTER TABLE "Beyblade" ADD COLUMN IF NOT EXISTS "hiddenFromCommunity" BOOLEAN NOT NULL DEFAULT false`,
    },
    {
      name: "User.canJudge",
      sql: `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "canJudge" BOOLEAN NOT NULL DEFAULT false`,
    },
    {
      name: "BeyPartLine enum",
      sql: `DO $$ BEGIN CREATE TYPE "BeyPartLine" AS ENUM ('BX', 'UX', 'CX'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    },
    {
      name: "BeyPartCategory enum",
      sql: `DO $$ BEGIN CREATE TYPE "BeyPartCategory" AS ENUM ('BLADE', 'RATCHET', 'BIT', 'LOCK_CHIP', 'MAIN_BLADE', 'ASSIST_BLADE'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    },
    {
      name: "BeyPart table",
      sql: `CREATE TABLE IF NOT EXISTS "BeyPart" (
        "id" TEXT NOT NULL,
        "line" "BeyPartLine" NOT NULL,
        "category" "BeyPartCategory" NOT NULL,
        "name" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "BeyPart_pkey" PRIMARY KEY ("id")
      )`,
    },
    {
      name: "BeyPart unique line+category+name",
      sql: `DO $$ BEGIN ALTER TABLE "BeyPart" ADD CONSTRAINT "BeyPart_line_category_name_key" UNIQUE ("line", "category", "name"); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    },
    {
      name: "Tournament.isTest",
      sql: `ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "isTest" BOOLEAN NOT NULL DEFAULT false`,
    },
    {
      name: "Match.isThirdPlace",
      sql: `ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "isThirdPlace" BOOLEAN NOT NULL DEFAULT false`,
    },
    {
      name: "Match.judgeId",
      sql: `ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "judgeId" TEXT`,
    },
    {
      name: "TournamentJudge table",
      sql: `CREATE TABLE IF NOT EXISTS "TournamentJudge" ("id" TEXT NOT NULL, "tournamentId" TEXT NOT NULL, "userId" TEXT NOT NULL, CONSTRAINT "TournamentJudge_pkey" PRIMARY KEY ("id"))`,
    },
    {
      name: "TournamentJudge unique tournamentId+userId",
      sql: `DO $$ BEGIN ALTER TABLE "TournamentJudge" ADD CONSTRAINT "TournamentJudge_tournamentId_userId_key" UNIQUE ("tournamentId", "userId"); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    },
    {
      name: "TournamentJudge.tournamentId FK",
      sql: `DO $$ BEGIN ALTER TABLE "TournamentJudge" ADD CONSTRAINT "TournamentJudge_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$`,
    },
    {
      name: "TournamentJudge.userId FK",
      sql: `DO $$ BEGIN ALTER TABLE "TournamentJudge" ADD CONSTRAINT "TournamentJudge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$`,
    },
    {
      name: "Tournament.setsToWin",
      sql: `ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "setsToWin" INTEGER NOT NULL DEFAULT 2`,
    },
    {
      name: "Tournament.pointsToWinSet",
      sql: `ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "pointsToWinSet" INTEGER NOT NULL DEFAULT 4`,
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
