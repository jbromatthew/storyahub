-- 아파트너 실사요청: 요청 기록 + 설치팀 실사 입력 링크 + 실사 결과
ALTER TABLE "ErpConstructionQuote" ADD COLUMN "surveyRequest" JSONB;
ALTER TABLE "ErpConstructionQuote" ADD COLUMN "surveyResult" JSONB;
ALTER TABLE "ErpConstructionQuote" ADD COLUMN "surveyToken" TEXT;
ALTER TABLE "ErpConstructionQuote" ADD COLUMN "surveyPin" TEXT;
ALTER TABLE "ErpConstructionQuote" ADD COLUMN "surveyEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ErpConstructionQuote" ADD COLUMN "surveyExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "ErpConstructionQuote_surveyToken_key" ON "ErpConstructionQuote"("surveyToken");
