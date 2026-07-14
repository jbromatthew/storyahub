-- Add 공사 구분(orderType) + 민원(complaints) to construction quotes
ALTER TABLE "ErpConstructionQuote" ADD COLUMN "orderType" TEXT NOT NULL DEFAULT '아파트너';
ALTER TABLE "ErpConstructionQuote" ADD COLUMN "complaints" JSONB NOT NULL DEFAULT '[]';
