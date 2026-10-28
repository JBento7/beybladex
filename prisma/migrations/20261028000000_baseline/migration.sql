-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PARTICIPANT', 'ORGANIZER');

-- CreateEnum
CREATE TYPE "TournamentFormat" AS ENUM ('ROUND_ROBIN', 'GROUPS', 'SINGLE_ELIMINATION', 'SWISS');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('DRAFT', 'REGISTRATION', 'IN_PROGRESS', 'FINISHED');

-- CreateEnum
CREATE TYPE "FinishType" AS ENUM ('SPIN_FINISH', 'OVER_FINISH', 'BURST_FINISH', 'EXTREME_FINISH', 'MISSLAUNCH');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'FINISHED');

-- CreateEnum
CREATE TYPE "DeckType" AS ENUM ('SOLO', 'THREE_ON_THREE');

-- CreateEnum
CREATE TYPE "SetStatus" AS ENUM ('IN_PROGRESS', 'FINISHED');

-- CreateEnum
CREATE TYPE "AnnouncementType" AS ENUM ('NEWS', 'POLL');

-- CreateEnum
CREATE TYPE "PollType" AS ENUM ('TEXT', 'CHECKBOX');

-- CreateEnum
CREATE TYPE "BeyPartLine" AS ENUM ('BX', 'UX', 'CX', 'RATCHET', 'BIT', 'BX_EXPAND', 'UX_EXPAND', 'CX_EXPAND');

-- CreateEnum
CREATE TYPE "BeyPartCategory" AS ENUM ('BLADE', 'RATCHET', 'BIT', 'LOCK_CHIP', 'MAIN_BLADE', 'ASSIST_BLADE', 'OVER_BLADE');

-- CreateTable
CREATE TABLE "ArenaLayout" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArenaLayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Community" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "logoUrl" TEXT,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Community_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PARTICIPANT',
    "beyblade" TEXT,
    "avatarUrl" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "isGuest" BOOLEAN NOT NULL DEFAULT false,
    "bladerName" TEXT,
    "canJudge" BOOLEAN NOT NULL DEFAULT false,
    "adminCommunity" TEXT,
    "homeCommunity" TEXT DEFAULT 'lbl',
    "featuredBey1" TEXT,
    "featuredBey2" TEXT,
    "featuredBey3" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizerInvite" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "usedBy" TEXT,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizerInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "format" "TournamentFormat" NOT NULL,
    "status" "TournamentStatus" NOT NULL DEFAULT 'DRAFT',
    "organizerId" TEXT NOT NULL,
    "maxParticipants" INTEGER,
    "startDate" TIMESTAMP(3),
    "deckType" "DeckType" NOT NULL DEFAULT 'SOLO',
    "prize" TEXT,
    "arenas" INTEGER DEFAULT 1,
    "isOfficial" BOOLEAN NOT NULL DEFAULT true,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "communitySlug" TEXT NOT NULL DEFAULT 'lbl',
    "isPartnership" BOOLEAN NOT NULL DEFAULT false,
    "swissRounds" INTEGER,
    "rulesVersion" TEXT,
    "judgingMode" TEXT NOT NULL DEFAULT 'RESTRICTED',
    "stateVersion" INTEGER NOT NULL DEFAULT 0,
    "setsToWin" INTEGER NOT NULL DEFAULT 2,
    "pointsToWinSet" INTEGER NOT NULL DEFAULT 4,
    "qualifiers" INTEGER,
    "isMultiDay" BOOLEAN NOT NULL DEFAULT false,
    "day2Date" TIMESTAMP(3),
    "day2SetsToWin" INTEGER,
    "day2PointsToWinSet" INTEGER,
    "bannerUrl" TEXT,
    "location" TEXT,
    "venueName" TEXT,
    "address" TEXT,
    "entryFee" DOUBLE PRECISION,
    "regulation" TEXT,
    "registrationDeadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentJudge" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TournamentJudge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentParticipant" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "rankingPoints" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "placement" INTEGER,
    "beyblade1" TEXT,
    "beyblade2" TEXT,
    "beyblade3" TEXT,
    "hasPaid" BOOLEAN NOT NULL DEFAULT false,
    "beybladeInspected" BOOLEAN NOT NULL DEFAULT false,
    "approved" BOOLEAN NOT NULL DEFAULT true,
    "finalsSwapUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "player1Id" TEXT NOT NULL,
    "player2Id" TEXT NOT NULL,
    "winnerId" TEXT,
    "groupId" TEXT,
    "judgeId" TEXT,
    "round" INTEGER NOT NULL,
    "bracketPos" INTEGER,
    "arena" INTEGER,
    "slot" INTEGER,
    "status" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "isWalkover" BOOLEAN NOT NULL DEFAULT false,
    "isThirdPlace" BOOLEAN NOT NULL DEFAULT false,
    "countdownAt" TIMESTAMP(3),
    "countdownKey" TEXT,
    "finishVideoAt" TIMESTAMP(3),
    "finishVideoType" TEXT,
    "onAirAt" TIMESTAMP(3),
    "xSidePlayerId" TEXT,
    "setsToWin" INTEGER,
    "pointsToWinSet" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchSet" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "player1Points" INTEGER NOT NULL DEFAULT 0,
    "player2Points" INTEGER NOT NULL DEFAULT 0,
    "winnerId" TEXT,
    "status" "SetStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchPoint" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "finishType" "FinishType" NOT NULL,
    "points" INTEGER NOT NULL,
    "beybladeUsed" TEXT,
    "beybladeId" TEXT,
    "setId" TEXT,
    "actionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchDeckOrder" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "cycleIndex" INTEGER NOT NULL,
    "bey1Id" TEXT NOT NULL,
    "bey2Id" TEXT NOT NULL,
    "bey3Id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchDeckOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Beyblade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "beyLine" TEXT,
    "blade" TEXT,
    "ratchet" TEXT,
    "bit" TEXT,
    "lockChip" TEXT,
    "metalBlade" TEXT,
    "assistBlade" TEXT,
    "overBlade" TEXT,
    "model" TEXT,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "hiddenFromCommunity" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Beyblade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "type" "AnnouncementType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollQuestion" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "text" TEXT NOT NULL,
    "type" "PollType" NOT NULL,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollResponse" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollAnswer" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answerText" TEXT,
    "selectedOptions" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "PollAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerifyToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerifyToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeybladeMatchRecord" (
    "id" TEXT NOT NULL,
    "beybladeId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "won" BOOLEAN NOT NULL,
    "pointsScored" INTEGER NOT NULL DEFAULT 0,
    "pointsConceded" INTEGER NOT NULL DEFAULT 0,
    "opponentBeybladeId" TEXT,
    "burstCount" INTEGER NOT NULL DEFAULT 0,
    "koCount" INTEGER NOT NULL DEFAULT 0,
    "spinFinishCount" INTEGER NOT NULL DEFAULT 0,
    "overFinishCount" INTEGER NOT NULL DEFAULT 0,
    "extremeFinishCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeybladeMatchRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeyPart" (
    "id" TEXT NOT NULL,
    "line" "BeyPartLine" NOT NULL,
    "category" "BeyPartCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT,
    "imageUrl" TEXT,
    "partType" TEXT,
    "weight" DOUBLE PRECISION,
    "statAttack" INTEGER,
    "statDefense" INTEGER,
    "statStamina" INTEGER,
    "statHeight" INTEGER,
    "statDash" INTEGER,
    "statBurst" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeyPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundParticipation" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoundParticipation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SwissRoundLog" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "rulesVersion" TEXT NOT NULL,
    "seed" INTEGER,
    "byeUserId" TEXT,
    "crossings" INTEGER NOT NULL DEFAULT 0,
    "optimal" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT NOT NULL DEFAULT '',
    "exceptionReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SwissRoundLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentAdminAction" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT,
    "idempotencyKey" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentAdminAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchAuditLog" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "op" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArenaLayout_key_key" ON "ArenaLayout"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Community_slug_key" ON "Community"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizerInvite_token_key" ON "OrganizerInvite"("token");

-- CreateIndex
CREATE INDEX "Tournament_communitySlug_idx" ON "Tournament"("communitySlug");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentJudge_tournamentId_userId_key" ON "TournamentJudge"("tournamentId", "userId");

-- CreateIndex
CREATE INDEX "TournamentParticipant_userId_idx" ON "TournamentParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentParticipant_tournamentId_userId_key" ON "TournamentParticipant"("tournamentId", "userId");

-- CreateIndex
CREATE INDEX "Match_tournamentId_round_idx" ON "Match"("tournamentId", "round");

-- CreateIndex
CREATE INDEX "Match_tournamentId_status_arena_idx" ON "Match"("tournamentId", "status", "arena");

-- CreateIndex
CREATE INDEX "Match_player1Id_idx" ON "Match"("player1Id");

-- CreateIndex
CREATE INDEX "Match_player2Id_idx" ON "Match"("player2Id");

-- CreateIndex
CREATE INDEX "Match_judgeId_idx" ON "Match"("judgeId");

-- CreateIndex
CREATE INDEX "MatchSet_matchId_idx" ON "MatchSet"("matchId");

-- CreateIndex
CREATE INDEX "MatchPoint_matchId_idx" ON "MatchPoint"("matchId");

-- CreateIndex
CREATE INDEX "MatchPoint_setId_idx" ON "MatchPoint"("setId");

-- CreateIndex
CREATE INDEX "MatchPoint_userId_idx" ON "MatchPoint"("userId");

-- CreateIndex
CREATE INDEX "MatchPoint_beybladeId_idx" ON "MatchPoint"("beybladeId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchPoint_matchId_actionId_key" ON "MatchPoint"("matchId", "actionId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchDeckOrder_matchId_userId_setNumber_cycleIndex_key" ON "MatchDeckOrder"("matchId", "userId", "setNumber", "cycleIndex");

-- CreateIndex
CREATE INDEX "Beyblade_userId_idx" ON "Beyblade"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PollResponse_announcementId_userId_key" ON "PollResponse"("announcementId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PollAnswer_responseId_questionId_key" ON "PollAnswer"("responseId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerifyToken_token_key" ON "EmailVerifyToken"("token");

-- CreateIndex
CREATE INDEX "BeybladeMatchRecord_userId_idx" ON "BeybladeMatchRecord"("userId");

-- CreateIndex
CREATE INDEX "BeybladeMatchRecord_beybladeId_idx" ON "BeybladeMatchRecord"("beybladeId");

-- CreateIndex
CREATE INDEX "BeybladeMatchRecord_tournamentId_idx" ON "BeybladeMatchRecord"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "BeybladeMatchRecord_beybladeId_matchId_key" ON "BeybladeMatchRecord"("beybladeId", "matchId");

-- CreateIndex
CREATE UNIQUE INDEX "BeyPart_line_category_name_key" ON "BeyPart"("line", "category", "name");

-- CreateIndex
CREATE INDEX "RoundParticipation_matchId_idx" ON "RoundParticipation"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "RoundParticipation_tournamentId_phase_round_userId_key" ON "RoundParticipation"("tournamentId", "phase", "round", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SwissRoundLog_tournamentId_round_key" ON "SwissRoundLog"("tournamentId", "round");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentAdminAction_idempotencyKey_key" ON "TournamentAdminAction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "TournamentAdminAction_tournamentId_idx" ON "TournamentAdminAction"("tournamentId");

-- CreateIndex
CREATE INDEX "MatchAuditLog_tournamentId_createdAt_idx" ON "MatchAuditLog"("tournamentId", "createdAt");

-- CreateIndex
CREATE INDEX "MatchAuditLog_matchId_idx" ON "MatchAuditLog"("matchId");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizerInvite" ADD CONSTRAINT "OrganizerInvite_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentJudge" ADD CONSTRAINT "TournamentJudge_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentJudge" ADD CONSTRAINT "TournamentJudge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentParticipant" ADD CONSTRAINT "TournamentParticipant_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentParticipant" ADD CONSTRAINT "TournamentParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentParticipant" ADD CONSTRAINT "TournamentParticipant_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSet" ADD CONSTRAINT "MatchSet_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSet" ADD CONSTRAINT "MatchSet_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPoint" ADD CONSTRAINT "MatchPoint_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPoint" ADD CONSTRAINT "MatchPoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPoint" ADD CONSTRAINT "MatchPoint_beybladeId_fkey" FOREIGN KEY ("beybladeId") REFERENCES "Beyblade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPoint" ADD CONSTRAINT "MatchPoint_setId_fkey" FOREIGN KEY ("setId") REFERENCES "MatchSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchDeckOrder" ADD CONSTRAINT "MatchDeckOrder_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Beyblade" ADD CONSTRAINT "Beyblade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollQuestion" ADD CONSTRAINT "PollQuestion_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollResponse" ADD CONSTRAINT "PollResponse_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollResponse" ADD CONSTRAINT "PollResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollAnswer" ADD CONSTRAINT "PollAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "PollResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollAnswer" ADD CONSTRAINT "PollAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "PollQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerifyToken" ADD CONSTRAINT "EmailVerifyToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeybladeMatchRecord" ADD CONSTRAINT "BeybladeMatchRecord_beybladeId_fkey" FOREIGN KEY ("beybladeId") REFERENCES "Beyblade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeybladeMatchRecord" ADD CONSTRAINT "BeybladeMatchRecord_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeybladeMatchRecord" ADD CONSTRAINT "BeybladeMatchRecord_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundParticipation" ADD CONSTRAINT "RoundParticipation_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SwissRoundLog" ADD CONSTRAINT "SwissRoundLog_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentAdminAction" ADD CONSTRAINT "TournamentAdminAction_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

