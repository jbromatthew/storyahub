-- 업체 미수금 — 우리가 먼저 낸 돈(선지급·재료값 대납)
CREATE TABLE "ErpConstructionAdvance" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL DEFAULT '',
    "orderType" TEXT NOT NULL DEFAULT '아파트너',
    "date" TEXT NOT NULL DEFAULT '',
    "amount" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL DEFAULT '',
    "memo" TEXT NOT NULL DEFAULT '',
    "settled" BOOLEAN NOT NULL DEFAULT false,
    "settledAt" TIMESTAMP(3),
    "byName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErpConstructionAdvance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ErpConstructionAdvance_teamId_settled_idx" ON "ErpConstructionAdvance"("teamId", "settled");
CREATE INDEX "ErpConstructionAdvance_orderType_idx" ON "ErpConstructionAdvance"("orderType");
