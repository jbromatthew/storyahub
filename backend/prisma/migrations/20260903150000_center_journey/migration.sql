-- 센터 여정관리 1단계 — 센터 마스터 · 통합 타임라인 · 문자포인트 스냅샷

CREATE TABLE "ErpCenter" (
    "groupKey" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "primaryName" TEXT NOT NULL DEFAULT '',
    "bizNo" TEXT NOT NULL DEFAULT '',
    "ownerName" TEXT NOT NULL DEFAULT '',
    "ownerId" TEXT NOT NULL DEFAULT '',
    "ownerPhone" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "types" JSONB NOT NULL DEFAULT '[]',
    "paymentStatus" TEXT NOT NULL DEFAULT '',
    "ticketName" TEXT NOT NULL DEFAULT '',
    "ticketExpiredAt" TIMESTAMP(3),
    "ticketRegular" BOOLEAN NOT NULL DEFAULT false,
    "messagePoint" INTEGER NOT NULL DEFAULT 0,
    "installTeam" TEXT NOT NULL DEFAULT '',
    "kioskKeys" JSONB NOT NULL DEFAULT '[]',
    "crmCreatedAt" TIMESTAMP(3),
    "lastAccessedAt" TIMESTAMP(3),
    "memo" TEXT NOT NULL DEFAULT '',
    "crmSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ErpCenter_pkey" PRIMARY KEY ("groupKey")
);
CREATE INDEX "ErpCenter_name_idx" ON "ErpCenter"("name");
CREATE INDEX "ErpCenter_bizNo_idx" ON "ErpCenter"("bizNo");
CREATE INDEX "ErpCenter_paymentStatus_idx" ON "ErpCenter"("paymentStatus");

CREATE TABLE "ErpCenterEvent" (
    "id" TEXT NOT NULL,
    "groupKey" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "actorEmail" TEXT NOT NULL DEFAULT '',
    "actorName" TEXT NOT NULL DEFAULT '',
    "team" TEXT NOT NULL DEFAULT '',
    "refTable" TEXT NOT NULL DEFAULT '',
    "refId" TEXT NOT NULL DEFAULT '',
    "amount" INTEGER,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ErpCenterEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ErpCenterEvent_groupKey_occurredAt_idx" ON "ErpCenterEvent"("groupKey", "occurredAt");
CREATE INDEX "ErpCenterEvent_type_idx" ON "ErpCenterEvent"("type");

CREATE TABLE "ErpCenterPointSnap" (
    "id" TEXT NOT NULL,
    "groupKey" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "point" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ErpCenterPointSnap_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ErpCenterPointSnap_groupKey_date_key" ON "ErpCenterPointSnap"("groupKey", "date");
CREATE INDEX "ErpCenterPointSnap_groupKey_date_idx" ON "ErpCenterPointSnap"("groupKey", "date");
