-- 참여신청서 본문 (기업 현황·매출·투자·지식재산권 등)
ALTER TABLE "ErpFoundersApply" ADD COLUMN "formData" JSONB NOT NULL DEFAULT '{}';
