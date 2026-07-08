-- 연차 관리 확장
ALTER TABLE "ErpLeaveBalance" ADD COLUMN IF NOT EXISTS "remarks" TEXT;

CREATE TABLE IF NOT EXISTS "ErpLeaveRewardGrant" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "grantType" TEXT NOT NULL DEFAULT 'paid',
    "days" DOUBLE PRECISION NOT NULL,
    "year" INTEGER NOT NULL,
    "userIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "remarks" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ErpLeaveRewardGrant_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ErpLeaveRewardGrant" DROP CONSTRAINT IF EXISTS "ErpLeaveRewardGrant_createdById_fkey";
ALTER TABLE "ErpLeaveRewardGrant" ADD CONSTRAINT "ErpLeaveRewardGrant_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "ErpLeaveRewardGrant_year_idx" ON "ErpLeaveRewardGrant"("year");
