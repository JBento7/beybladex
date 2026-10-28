-- Correções de DADOS que o antigo GET /api/migrate executava a cada chamada.
-- Saíram da rota: alteram registros existentes (inclusive históricos) e não
-- devem rodar automaticamente. Já devem ter sido aplicadas em produção.
-- Para reaplicar alguma: revise o efeito com um SELECT equivalente, faça
-- backup e rode manualmente, uma de cada vez, fora do horário de eventos.

-- Delete null-userId participants
DELETE FROM "TournamentParticipant" WHERE "userId" IS NULL;

-- Backfill legacy poll questions
INSERT INTO "PollQuestion" (id, "announcementId", "order", text, type, options, "createdAt")
        SELECT 'legacyq_' || substr(md5(a.id), 1, 20), a.id, 0, a.content, a."pollType", a.options, a."createdAt"
        FROM "Announcement" a
        WHERE a.type = 'POLL' AND a."pollType" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "PollQuestion" q WHERE q."announcementId" = a.id);

-- Backfill legacy poll answers
INSERT INTO "PollAnswer" (id, "responseId", "questionId", "answerText", "selectedOptions")
        SELECT 'legacya_' || substr(md5(r.id), 1, 20), r.id, q.id, r."answerText", r."selectedOptions"
        FROM "PollResponse" r
        JOIN "PollQuestion" q ON q."announcementId" = r."announcementId" AND q."order" = 0
        WHERE NOT EXISTS (SELECT 1 FROM "PollAnswer" pa WHERE pa."responseId" = r.id AND pa."questionId" = q.id);

-- Community branding
UPDATE "Community" SET "logoUrl" = CASE "slug" WHEN 'lbl' THEN '/lbl-logo.png' WHEN 'lbm' THEN '/lbm-logo.webp' END, "color" = CASE "slug" WHEN 'lbl' THEN '#f0a500' WHEN 'lbm' THEN '#6ac146' END WHERE "slug" IN ('lbl','lbm');

-- BeyEncontro community fix
UPDATE "Tournament" t SET "communitySlug" = u."homeCommunity" FROM "User" u WHERE u.id = t."organizerId" AND t."isOfficial" = false AND u.role <> 'ORGANIZER' AND u."homeCommunity" IS NOT NULL AND t."communitySlug" IS DISTINCT FROM u."homeCommunity";
