-- BROJ FOUNDERS — 참관객 등록 (참가비 2만원, 계좌이체)
ALTER TABLE "ErpFoundersApply"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'applicant',
  ADD COLUMN "repTitle" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "feeAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "payerName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "paidAt" TIMESTAMP(3);
CREATE INDEX "ErpFoundersApply_kind_status_idx" ON "ErpFoundersApply"("kind", "status");
