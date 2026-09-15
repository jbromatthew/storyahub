-- 월간 추이 — 이탈률의 분모
CREATE TABLE "ErpChurnMonthly" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "activeCenters" INTEGER,
    "recurring" INTEGER,
    "yearPass" INTEGER,
    "bankTransfer" INTEGER,
    "renewDue" INTEGER,
    "churnTotal" INTEGER,
    "churnMid" INTEGER,
    "churnConv" INTEGER,
    "renewed" INTEGER,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErpChurnMonthly_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ErpChurnMonthly_month_key" ON "ErpChurnMonthly"("month");
