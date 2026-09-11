-- 참관객 참가비 증빙 — 현금영수증 · 세금계산서
ALTER TABLE "ErpFoundersApply" ADD COLUMN "receiptType"  TEXT NOT NULL DEFAULT '';
ALTER TABLE "ErpFoundersApply" ADD COLUMN "receiptNo"    TEXT NOT NULL DEFAULT '';
ALTER TABLE "ErpFoundersApply" ADD COLUMN "receiptEmail" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ErpFoundersApply" ADD COLUMN "receiptNote"  TEXT NOT NULL DEFAULT '';
ALTER TABLE "ErpFoundersApply" ADD COLUMN "receiptDone"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ErpFoundersApply" ADD COLUMN "receiptAt"    TIMESTAMP(3);
