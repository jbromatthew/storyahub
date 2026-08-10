-- 일일보고 코멘트: 해결 개념 대신 ★ 중요 표시 (중요만 스레드함에 노출)
ALTER TABLE "ErpDailyComment" ADD COLUMN "important" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "ErpDailyComment_important_idx" ON "ErpDailyComment"("important");
