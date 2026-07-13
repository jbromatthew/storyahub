ALTER TABLE "ErpConstructionQuote" ADD COLUMN "startDate" TEXT;
ALTER TABLE "ErpConstructionQuote" ADD COLUMN "endDate" TEXT;
ALTER TABLE "ErpConstructionQuote" ALTER COLUMN "status" SET DEFAULT 'requested';
