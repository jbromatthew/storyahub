-- 미수금은 조금씩 갚아 나갈 수 있다
ALTER TABLE "ErpConstructionAdvance" ADD COLUMN "offsetAmount" INTEGER NOT NULL DEFAULT 0;
-- 이미 회수로 넘겨둔 것은 전액 회수한 것으로 본다
UPDATE "ErpConstructionAdvance" SET "offsetAmount" = "amount" WHERE "settled" = true;

-- 업체 정산 한 건 — 정산 대상액 · 미수금 상계 · 실입금
CREATE TABLE "ErpConstructionSettlement" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL DEFAULT '',
    "orderType" TEXT NOT NULL DEFAULT '아파트너',
    "date" TEXT NOT NULL DEFAULT '',
    "gross" INTEGER NOT NULL DEFAULT 0,
    "offset" INTEGER NOT NULL DEFAULT 0,
    "paid" INTEGER NOT NULL DEFAULT 0,
    "allocations" JSONB NOT NULL DEFAULT '[]',
    "memo" TEXT NOT NULL DEFAULT '',
    "byName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErpConstructionSettlement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ErpConstructionSettlement_teamId_date_idx" ON "ErpConstructionSettlement"("teamId", "date");
CREATE INDEX "ErpConstructionSettlement_orderType_idx" ON "ErpConstructionSettlement"("orderType");
