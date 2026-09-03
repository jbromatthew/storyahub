-- 센터 여정관리 2단계 — 키오스크 자산 · AS 티켓 · 세일즈/CXM 접점

CREATE TABLE "ErpCenterAsset" (
    "id" TEXT NOT NULL,
    "groupKey" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "installedAt" TIMESTAMP(3),
    "warrantyUntil" TIMESTAMP(3),
    "teamId" TEXT NOT NULL DEFAULT '',
    "teamName" TEXT NOT NULL DEFAULT '',
    "installer" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "location" TEXT NOT NULL DEFAULT '',
    "removedAt" TIMESTAMP(3),
    "movedFromGroupKey" INTEGER,
    "note" TEXT NOT NULL DEFAULT '',
    "createdEmail" TEXT NOT NULL DEFAULT '',
    "createdName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ErpCenterAsset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ErpCenterAsset_serial_key" ON "ErpCenterAsset"("serial");
CREATE INDEX "ErpCenterAsset_groupKey_idx" ON "ErpCenterAsset"("groupKey");
CREATE INDEX "ErpCenterAsset_status_idx" ON "ErpCenterAsset"("status");
CREATE INDEX "ErpCenterAsset_teamId_idx" ON "ErpCenterAsset"("teamId");

CREATE TABLE "ErpAsTicket" (
    "id" TEXT NOT NULL,
    "ticketNo" TEXT NOT NULL,
    "groupKey" INTEGER NOT NULL,
    "assetId" TEXT NOT NULL DEFAULT '',
    "serial" TEXT NOT NULL DEFAULT '',
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "channel" TEXT NOT NULL,
    "symptom" TEXT NOT NULL,
    "cause" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'received',
    "teamId" TEXT NOT NULL DEFAULT '',
    "teamName" TEXT NOT NULL DEFAULT '',
    "technician" TEXT NOT NULL DEFAULT '',
    "visitedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "resolution" TEXT NOT NULL DEFAULT '',
    "amount" INTEGER,
    "rejectReason" TEXT NOT NULL DEFAULT '',
    "swapOutSerial" TEXT NOT NULL DEFAULT '',
    "swapInSerial" TEXT NOT NULL DEFAULT '',
    "warrantyAtReceipt" BOOLEAN,
    "reopenOf" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "createdEmail" TEXT NOT NULL DEFAULT '',
    "createdName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ErpAsTicket_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ErpAsTicket_ticketNo_key" ON "ErpAsTicket"("ticketNo");
CREATE INDEX "ErpAsTicket_groupKey_receivedAt_idx" ON "ErpAsTicket"("groupKey", "receivedAt");
CREATE INDEX "ErpAsTicket_status_idx" ON "ErpAsTicket"("status");
CREATE INDEX "ErpAsTicket_resolution_idx" ON "ErpAsTicket"("resolution");
CREATE INDEX "ErpAsTicket_teamId_idx" ON "ErpAsTicket"("teamId");

CREATE TABLE "ErpCenterContact" (
    "id" TEXT NOT NULL,
    "groupKey" INTEGER NOT NULL,
    "team" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "actorEmail" TEXT NOT NULL DEFAULT '',
    "actorName" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT '',
    "nextActionAt" TIMESTAMP(3),
    "nextAction" TEXT NOT NULL DEFAULT '',
    "sentiment" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ErpCenterContact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ErpCenterContact_groupKey_occurredAt_idx" ON "ErpCenterContact"("groupKey", "occurredAt");
CREATE INDEX "ErpCenterContact_team_idx" ON "ErpCenterContact"("team");
CREATE INDEX "ErpCenterContact_nextActionAt_idx" ON "ErpCenterContact"("nextActionAt");
