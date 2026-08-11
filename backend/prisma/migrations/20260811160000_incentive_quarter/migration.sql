CREATE TABLE "ErpIncentiveQuarter" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "hwSales" JSONB NOT NULL DEFAULT '[]',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErpIncentiveQuarter_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ErpIncentiveQuarter_year_quarter_key" ON "ErpIncentiveQuarter"("year", "quarter");
