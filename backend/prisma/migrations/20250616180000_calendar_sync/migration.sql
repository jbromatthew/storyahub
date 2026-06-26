-- Calendar sync: Google OAuth connection + Event external ids

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "eventKitId" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "externalUpdatedAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "syncSource" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "Event_userId_googleId_idx" ON "Event"("userId", "googleId");
CREATE INDEX IF NOT EXISTS "Event_userId_eventKitId_idx" ON "Event"("userId", "eventKitId");

CREATE TABLE IF NOT EXISTS "CalendarConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "tokenExpiry" TIMESTAMP(3),
    "calendarId" TEXT,
    "calendarName" TEXT,
    "syncToken" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CalendarConnection_userId_provider_key" ON "CalendarConnection"("userId", "provider");

ALTER TABLE "CalendarConnection" DROP CONSTRAINT IF EXISTS "CalendarConnection_userId_fkey";
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
