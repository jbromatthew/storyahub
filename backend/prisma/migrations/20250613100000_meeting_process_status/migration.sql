-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN "processStatus" TEXT NOT NULL DEFAULT 'done';
ALTER TABLE "Meeting" ADD COLUMN "processError" TEXT;
