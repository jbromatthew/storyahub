ALTER TABLE "ErpConstructionQuote" ADD COLUMN "payouts" JSONB NOT NULL DEFAULT '[]';

CREATE TABLE "ErpConstructionTeam" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "contact" TEXT,
  "note" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ErpConstructionTeam_pkey" PRIMARY KEY ("id")
);
