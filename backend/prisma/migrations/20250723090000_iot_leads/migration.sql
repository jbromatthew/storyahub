-- IoT 견적 리드
CREATE TABLE "ErpIotLead" (
  "id" TEXT NOT NULL,
  "centerName" TEXT NOT NULL,
  "industry" TEXT NOT NULL DEFAULT '',
  "usesBroj" BOOLEAN NOT NULL DEFAULT false,
  "address" TEXT NOT NULL DEFAULT '',
  "phone" TEXT NOT NULL,
  "pyeong" INTEGER NOT NULL DEFAULT 0,
  "networkSize" TEXT NOT NULL DEFAULT 'small',
  "acCount" INTEGER NOT NULL DEFAULT 0,
  "speakerCount" INTEGER NOT NULL DEFAULT 0,
  "panelCount" INTEGER NOT NULL DEFAULT 0,
  "supplyAmount" INTEGER NOT NULL DEFAULT 0,
  "totalAmount" INTEGER NOT NULL DEFAULT 0,
  "breakdown" JSONB NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'new',
  "memo" TEXT,
  "source" TEXT NOT NULL DEFAULT 'instagram',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ErpIotLead_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ErpIotLead_createdAt_idx" ON "ErpIotLead"("createdAt");
CREATE INDEX "ErpIotLead_status_idx" ON "ErpIotLead"("status");
