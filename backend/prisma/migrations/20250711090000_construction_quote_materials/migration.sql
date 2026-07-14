-- Add materials (투입 부품/자재 원가) to construction quotes for margin calc
ALTER TABLE "ErpConstructionQuote" ADD COLUMN "materials" JSONB NOT NULL DEFAULT '[]';
