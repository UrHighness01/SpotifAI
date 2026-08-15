-- AlterTable
ALTER TABLE "Track" ADD COLUMN "fingerprintCapturedAt" DATETIME;
ALTER TABLE "Track" ADD COLUMN "fingerprintHash" TEXT;
ALTER TABLE "Track" ADD COLUMN "fingerprintModel" TEXT;
