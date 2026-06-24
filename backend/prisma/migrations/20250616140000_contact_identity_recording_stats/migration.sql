-- Contact identity grouping (same name + phone)
ALTER TABLE "Contact" ADD COLUMN "identityKey" TEXT;
CREATE INDEX "Contact_userId_identityKey_idx" ON "Contact"("userId", "identityKey");

-- Recording usage events for analytics / billing design
CREATE TABLE "RecordingUsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "meetingId" TEXT,
    "plan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordingUsageEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecordingUsageEvent_userId_createdAt_idx" ON "RecordingUsageEvent"("userId", "createdAt");

ALTER TABLE "RecordingUsageEvent" ADD CONSTRAINT "RecordingUsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
