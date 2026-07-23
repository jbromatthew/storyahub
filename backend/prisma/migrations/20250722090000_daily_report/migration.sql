-- 일일보고 — CEO/COO 전용
CREATE TABLE "ErpDailyReport" (
  "id" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "authorName" TEXT NOT NULL,
  "authorEmail" TEXT NOT NULL,
  "did" TEXT NOT NULL DEFAULT '',
  "missed" TEXT NOT NULL DEFAULT '',
  "plan" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ErpDailyReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ErpDailyReport_date_authorEmail_key" ON "ErpDailyReport"("date", "authorEmail");
CREATE INDEX "ErpDailyReport_date_idx" ON "ErpDailyReport"("date");
