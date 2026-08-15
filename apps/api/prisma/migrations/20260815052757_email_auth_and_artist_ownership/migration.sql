/*
  Warnings:

  - Added the required column `ownerId` to the `Artist` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Artist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "avatarPath" TEXT,
    "aiModel" TEXT NOT NULL DEFAULT 'unknown',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Artist_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Artist" ("aiModel", "avatarPath", "bio", "createdAt", "id", "name") SELECT "aiModel", "avatarPath", "bio", "createdAt", "id", "name" FROM "Artist";
DROP TABLE "Artist";
ALTER TABLE "new_Artist" RENAME TO "Artist";
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerificationTokenHash" TEXT,
    "emailVerificationExpires" DATETIME,
    "passwordResetTokenHash" TEXT,
    "passwordResetExpires" DATETIME
);
INSERT INTO "new_User" ("createdAt", "displayName", "email", "id", "passwordHash") SELECT "createdAt", "displayName", "email", "id", "passwordHash" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_emailVerificationTokenHash_key" ON "User"("emailVerificationTokenHash");
CREATE UNIQUE INDEX "User_passwordResetTokenHash_key" ON "User"("passwordResetTokenHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
