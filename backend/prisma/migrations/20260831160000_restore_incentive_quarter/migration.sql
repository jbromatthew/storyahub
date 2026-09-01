-- 인센티브 메뉴를 다시 살리면서 분기 수기 입력 테이블을 복구한다.
CREATE TABLE IF NOT EXISTS "ErpIncentiveQuarter" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "hwSales" JSONB NOT NULL DEFAULT '[]',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ErpIncentiveQuarter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ErpIncentiveQuarter_year_quarter_key"
    ON "ErpIncentiveQuarter"("year", "quarter");
