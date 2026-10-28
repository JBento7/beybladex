-- Aligns three foreign keys that the legacy /api/migrate created inline
-- (ON UPDATE NO ACTION) with what the Prisma schema declares (ON UPDATE
-- CASCADE). Constraint-only change: no row is modified. Primary keys are cuids
-- and never updated, so behaviour is the same; this only removes schema drift.
-- On a database created by the baseline it recreates identical constraints.
ALTER TABLE "RoundParticipation" DROP CONSTRAINT IF EXISTS "RoundParticipation_matchId_fkey";
ALTER TABLE "RoundParticipation" ADD CONSTRAINT "RoundParticipation_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SwissRoundLog" DROP CONSTRAINT IF EXISTS "SwissRoundLog_tournamentId_fkey";
ALTER TABLE "SwissRoundLog" ADD CONSTRAINT "SwissRoundLog_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TournamentAdminAction" DROP CONSTRAINT IF EXISTS "TournamentAdminAction_tournamentId_fkey";
ALTER TABLE "TournamentAdminAction" ADD CONSTRAINT "TournamentAdminAction_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
