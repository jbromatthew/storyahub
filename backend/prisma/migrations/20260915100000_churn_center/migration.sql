-- 이탈 센터 — 시트를 그대로 옮겨 둔다
CREATE TABLE "ErpChurnCenter" (
    "id" TEXT NOT NULL,
    "sheetRow" INTEGER NOT NULL,
    "churnDate" TEXT NOT NULL DEFAULT '',
    "month" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT '',
    "industry" TEXT NOT NULL DEFAULT '',
    "centerName" TEXT NOT NULL DEFAULT '',
    "joinYear" TEXT NOT NULL DEFAULT '',
    "plan" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "service" TEXT NOT NULL DEFAULT '',
    "program" TEXT NOT NULL DEFAULT '',
    "detail" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "firstPaidAt" TEXT NOT NULL DEFAULT '',
    "usedMonths" INTEGER,
    "week" TEXT NOT NULL DEFAULT '',
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErpChurnCenter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ErpChurnCenter_sheetRow_key" ON "ErpChurnCenter"("sheetRow");
CREATE INDEX "ErpChurnCenter_month_idx" ON "ErpChurnCenter"("month");
CREATE INDEX "ErpChurnCenter_reason_idx" ON "ErpChurnCenter"("reason");
CREATE INDEX "ErpChurnCenter_industry_idx" ON "ErpChurnCenter"("industry");
