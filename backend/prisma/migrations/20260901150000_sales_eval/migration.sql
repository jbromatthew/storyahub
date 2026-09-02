-- 상담자료 CEO 승인 단계 폐지 (승인은 COO 단독). 기존 CEO 승인 건은 0건.
ALTER TABLE "ErpConsultDoc" DROP COLUMN IF EXISTS "ceoApproved";
ALTER TABLE "ErpConsultDoc" DROP COLUMN IF EXISTS "ceoAt";

-- 상담 성공·실패 사례 공유
CREATE TABLE IF NOT EXISTS "ErpSalesCase" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'success',
    "note" TEXT,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorEmail" TEXT NOT NULL,
    "cooApproved" BOOLEAN NOT NULL DEFAULT false,
    "cooAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ErpSalesCase_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ErpSalesCase_createdAt_idx" ON "ErpSalesCase"("createdAt");
CREATE INDEX IF NOT EXISTS "ErpSalesCase_authorEmail_idx" ON "ErpSalesCase"("authorEmail");

-- 팀장 평가는 정량 지표로 대체 — 수기 입력은 채널톡 활용 횟수만 남는다
ALTER TABLE "ErpIncentiveQuarter" ADD COLUMN IF NOT EXISTS "channelUsage" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "ErpIncentiveQuarter" DROP COLUMN IF EXISTS "leaderScores";
