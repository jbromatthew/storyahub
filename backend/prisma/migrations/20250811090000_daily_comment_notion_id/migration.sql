-- 노션 댓글 역동기화: 원본 댓글 ID로 중복 방지
ALTER TABLE "ErpDailyComment" ADD COLUMN "notionCommentId" TEXT;
CREATE UNIQUE INDEX "ErpDailyComment_notionCommentId_key" ON "ErpDailyComment"("notionCommentId");
