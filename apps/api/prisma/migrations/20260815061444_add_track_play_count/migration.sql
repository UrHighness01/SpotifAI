-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Track" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "albumId" TEXT,
    "artistId" TEXT NOT NULL,
    "audioPath" TEXT NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "aiModel" TEXT NOT NULL,
    "aiPrompt" TEXT,
    "aiGenerationNotes" TEXT,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Track_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "Album" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Track_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Track" ("aiGenerationNotes", "aiModel", "aiPrompt", "albumId", "artistId", "audioPath", "createdAt", "durationSec", "id", "title") SELECT "aiGenerationNotes", "aiModel", "aiPrompt", "albumId", "artistId", "audioPath", "createdAt", "durationSec", "id", "title" FROM "Track";
DROP TABLE "Track";
ALTER TABLE "new_Track" RENAME TO "Track";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
