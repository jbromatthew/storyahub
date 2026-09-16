-- 브로제이 파트너스 — 제휴 후보부터 계약까지
CREATE TABLE "ErpPartner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "field" TEXT NOT NULL DEFAULT '',
    "tier" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'lead',
    "statusAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "feature" TEXT NOT NULL DEFAULT '',
    "ceoName" TEXT NOT NULL DEFAULT '',
    "contact" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "site" TEXT NOT NULL DEFAULT '',
    "ownerName" TEXT NOT NULL DEFAULT '',
    "startAt" TEXT NOT NULL DEFAULT '',
    "endAt" TEXT NOT NULL DEFAULT '',
    "commission" TEXT NOT NULL DEFAULT '',
    "benefit" TEXT NOT NULL DEFAULT '',
    "nextStep" TEXT NOT NULL DEFAULT '',
    "nextAt" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErpPartner_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ErpPartner_status_idx" ON "ErpPartner"("status");
CREATE INDEX "ErpPartner_tier_idx" ON "ErpPartner"("tier");
