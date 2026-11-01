-- Tournament image gallery (docs/GALERIA.md). Additive only: existing covers
-- stay in "Tournament"."bannerUrl" and keep working (shown as the cover).
CREATE TABLE IF NOT EXISTS "StoredImage" (
  "id" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "size" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "card" BYTEA NOT NULL,
  "thumb" BYTEA NOT NULL,
  "uploadedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoredImage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TournamentImage" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "imageId" TEXT,
  "url" TEXT,
  "alt" TEXT NOT NULL DEFAULT '',
  "position" INTEGER NOT NULL,
  "isCover" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TournamentImage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TournamentImage_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TournamentImage_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "StoredImage"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "TournamentImage_tournamentId_position_idx" ON "TournamentImage"("tournamentId", "position");
CREATE INDEX IF NOT EXISTS "TournamentImage_imageId_idx" ON "TournamentImage"("imageId");
