-- 심사 점수와 시상
ALTER TABLE "ErpFoundersApply" ADD COLUMN "scores" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "ErpFoundersApply" ADD COLUMN "award" TEXT NOT NULL DEFAULT '';
