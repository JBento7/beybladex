-- Tournament."stateVersion": bumped by the database itself, in the SAME
-- transaction as every change a live page shows. The /version endpoint then
-- reads one integer instead of hashing the whole history.
--  * Match: insert/delete, or an update of a result/schedule column (NOT the
--    telão heartbeat columns onAirAt/countdownAt/finishVideoAt/xSide…).
--  * MatchPoint, MatchSet, TournamentParticipant: any insert/update/delete.
--  * Tournament: any update other than stateVersion itself.
-- Idempotent: safe to run again.

CREATE OR REPLACE FUNCTION lbl_bump_by_tournament() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "Tournament" t SET "stateVersion" = t."stateVersion" + 1
  WHERE t.id IN (SELECT DISTINCT "tournamentId" FROM changed);
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION lbl_bump_by_match() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "Tournament" t SET "stateVersion" = t."stateVersion" + 1
  WHERE t.id IN (SELECT DISTINCT m."tournamentId" FROM "Match" m WHERE m.id IN (SELECT DISTINCT "matchId" FROM changed));
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION lbl_bump_match_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "Tournament" t SET "stateVersion" = t."stateVersion" + 1
  WHERE t.id IN (
    SELECT DISTINCT n."tournamentId" FROM newrows n JOIN oldrows o ON o.id = n.id
    WHERE (n.status, n."winnerId", n."player1Id", n."player2Id", n.round, n.arena, n.slot, n."judgeId", n."isWalkover", n."bracketPos")
      IS DISTINCT FROM (o.status, o."winnerId", o."player1Id", o."player2Id", o.round, o.arena, o.slot, o."judgeId", o."isWalkover", o."bracketPos")
  );
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION lbl_bump_tournament_self() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."stateVersion" = OLD."stateVersion" AND ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN
    NEW."stateVersion" := OLD."stateVersion" + 1;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS lbl_sv_match_ins ON "Match";
CREATE TRIGGER lbl_sv_match_ins AFTER INSERT ON "Match" REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION lbl_bump_by_tournament();
DROP TRIGGER IF EXISTS lbl_sv_match_del ON "Match";
CREATE TRIGGER lbl_sv_match_del AFTER DELETE ON "Match" REFERENCING OLD TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION lbl_bump_by_tournament();
DROP TRIGGER IF EXISTS lbl_sv_match_upd ON "Match";
CREATE TRIGGER lbl_sv_match_upd AFTER UPDATE ON "Match" REFERENCING NEW TABLE AS newrows OLD TABLE AS oldrows FOR EACH STATEMENT EXECUTE FUNCTION lbl_bump_match_update();

DROP TRIGGER IF EXISTS lbl_sv_point_ins ON "MatchPoint";
CREATE TRIGGER lbl_sv_point_ins AFTER INSERT ON "MatchPoint" REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION lbl_bump_by_match();
DROP TRIGGER IF EXISTS lbl_sv_point_del ON "MatchPoint";
CREATE TRIGGER lbl_sv_point_del AFTER DELETE ON "MatchPoint" REFERENCING OLD TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION lbl_bump_by_match();

DROP TRIGGER IF EXISTS lbl_sv_set_ins ON "MatchSet";
CREATE TRIGGER lbl_sv_set_ins AFTER INSERT ON "MatchSet" REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION lbl_bump_by_match();
DROP TRIGGER IF EXISTS lbl_sv_set_upd ON "MatchSet";
CREATE TRIGGER lbl_sv_set_upd AFTER UPDATE ON "MatchSet" REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION lbl_bump_by_match();
DROP TRIGGER IF EXISTS lbl_sv_set_del ON "MatchSet";
CREATE TRIGGER lbl_sv_set_del AFTER DELETE ON "MatchSet" REFERENCING OLD TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION lbl_bump_by_match();

DROP TRIGGER IF EXISTS lbl_sv_part_ins ON "TournamentParticipant";
CREATE TRIGGER lbl_sv_part_ins AFTER INSERT ON "TournamentParticipant" REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION lbl_bump_by_tournament();
DROP TRIGGER IF EXISTS lbl_sv_part_upd ON "TournamentParticipant";
CREATE TRIGGER lbl_sv_part_upd AFTER UPDATE ON "TournamentParticipant" REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION lbl_bump_by_tournament();
DROP TRIGGER IF EXISTS lbl_sv_part_del ON "TournamentParticipant";
CREATE TRIGGER lbl_sv_part_del AFTER DELETE ON "TournamentParticipant" REFERENCING OLD TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION lbl_bump_by_tournament();

DROP TRIGGER IF EXISTS lbl_sv_tournament_self ON "Tournament";
CREATE TRIGGER lbl_sv_tournament_self BEFORE UPDATE ON "Tournament" FOR EACH ROW EXECUTE FUNCTION lbl_bump_tournament_self();
