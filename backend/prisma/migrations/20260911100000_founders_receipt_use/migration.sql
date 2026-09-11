-- 현금영수증 용도 — personal 소득공제(개인) | biz 지출증빙(사업자)
ALTER TABLE "ErpFoundersApply" ADD COLUMN "receiptUse" TEXT NOT NULL DEFAULT '';
-- 이미 들어온 현금영수증은 휴대폰 번호로 받았으니 소득공제용이다
UPDATE "ErpFoundersApply" SET "receiptUse" = 'personal' WHERE "receiptType" = 'cash';
