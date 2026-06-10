-- AlterTable
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT,
ADD COLUMN "onboardingDone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "trialStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "provider" SET DEFAULT 'email';
