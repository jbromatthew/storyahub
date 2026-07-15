-- Add 개소별 현장 사진(공사전/공사후) to construction quotes
ALTER TABLE "ErpConstructionQuote" ADD COLUMN "sitePhotos" JSONB NOT NULL DEFAULT '[]';
