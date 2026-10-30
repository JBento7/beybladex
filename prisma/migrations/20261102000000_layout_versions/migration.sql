-- Published layout versions of the arena screens (docs/EDITOR-LAYOUT.md).
-- Additive only: a new table. The existing ArenaLayout rows are untouched and
-- remain the source until the first publication of each screen (they are read
-- as "version 0" and keep being written for older telões).
CREATE TABLE IF NOT EXISTS "LayoutVersion" (
    "id" TEXT NOT NULL,
    "screen" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "composition" JSONB NOT NULL,
    "publishedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LayoutVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LayoutVersion_screen_version_key" ON "LayoutVersion"("screen", "version");
