-- 현장 업로드 공유 링크(무계정 + PIN)
ALTER TABLE "ErpConstructionQuote" ADD COLUMN "shareToken" TEXT;
ALTER TABLE "ErpConstructionQuote" ADD COLUMN "sharePin" TEXT;
ALTER TABLE "ErpConstructionQuote" ADD COLUMN "shareEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ErpConstructionQuote" ADD COLUMN "shareExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "ErpConstructionQuote_shareToken_key" ON "ErpConstructionQuote"("shareToken");
