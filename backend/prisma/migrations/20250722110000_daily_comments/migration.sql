-- 일일보고 항목별 코멘트 스레드
CREATE TABLE "ErpDailyComment" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "section" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "itemText" TEXT NOT NULL,
  "parentId" TEXT,
  "authorEmail" TEXT NOT NULL,
  "authorName" TEXT NOT NULL,
  "body" TEXT NOT NULL DEFAULT '',
  "files" JSONB NOT NULL DEFAULT '[]',
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ErpDailyComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ErpDailyComment_reportId_idx" ON "ErpDailyComment"("reportId");
CREATE INDEX "ErpDailyComment_resolved_idx" ON "ErpDailyComment"("resolved");
