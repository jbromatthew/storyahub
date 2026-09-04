-- 공동 주최 심사 페이지
ALTER TABLE "ErpFoundersRound" ADD COLUMN "reviewPassHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ErpFoundersApply" ADD COLUMN "reviewNote" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ErpFoundersApply" ADD COLUMN "reviewedBy" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ErpFoundersApply" ADD COLUMN "reviewedAt" TIMESTAMP(3);
