-- AlterTable
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "linkedUserId" TEXT;
CREATE INDEX IF NOT EXISTS "Contact_userId_linkedUserId_idx" ON "Contact"("userId", "linkedUserId");

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserFriend" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "addresseeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "contactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "UserFriend_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ResourceShare" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "granteeId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserFriend_requesterId_addresseeId_key" ON "UserFriend"("requesterId", "addresseeId");
CREATE INDEX IF NOT EXISTS "UserFriend_addresseeId_status_idx" ON "UserFriend"("addresseeId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "ResourceShare_resourceType_resourceId_granteeId_key" ON "ResourceShare"("resourceType", "resourceId", "granteeId");
CREATE INDEX IF NOT EXISTS "ResourceShare_granteeId_resourceType_idx" ON "ResourceShare"("granteeId", "resourceType");
CREATE INDEX IF NOT EXISTS "ResourceShare_ownerId_resourceType_resourceId_idx" ON "ResourceShare"("ownerId", "resourceType", "resourceId");

ALTER TABLE "UserFriend" ADD CONSTRAINT "UserFriend_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserFriend" ADD CONSTRAINT "UserFriend_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResourceShare" ADD CONSTRAINT "ResourceShare_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResourceShare" ADD CONSTRAINT "ResourceShare_granteeId_fkey" FOREIGN KEY ("granteeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
