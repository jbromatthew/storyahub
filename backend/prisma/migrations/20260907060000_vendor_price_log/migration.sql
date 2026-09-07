-- 협력사 단가 변경 이력
CREATE TABLE "ErpVendorPriceLog" (
  "id"        TEXT NOT NULL,
  "vendorId"  TEXT NOT NULL DEFAULT 'kreiser',
  "byEmail"   TEXT NOT NULL,
  "byName"    TEXT NOT NULL DEFAULT '',
  "changes"   JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ErpVendorPriceLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ErpVendorPriceLog_vendorId_createdAt_idx" ON "ErpVendorPriceLog"("vendorId","createdAt");
