-- 협력사(크라이저) 발주 포털
CREATE TABLE "ErpVendorPortal" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "pin" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "products" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ErpVendorPortal_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ErpVendorOrder" (
  "id" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL DEFAULT 'kreiser',
  "orderDate" TEXT NOT NULL,
  "items" JSONB NOT NULL DEFAULT '[]',
  "totalAmount" INTEGER NOT NULL DEFAULT 0,
  "prepayRate" INTEGER NOT NULL DEFAULT 30,
  "prepayAmount" INTEGER NOT NULL DEFAULT 0,
  "balanceAmount" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'requested',
  "approvedAt" TIMESTAMP(3),
  "prepayRequestedAt" TIMESTAMP(3),
  "prepayPaidAt" TIMESTAMP(3),
  "prepayTaxDate" TEXT,
  "balanceRequestedAt" TIMESTAMP(3),
  "balancePaidAt" TIMESTAMP(3),
  "balanceTaxDate" TEXT,
  "deliveries" JSONB NOT NULL DEFAULT '[]',
  "history" JSONB NOT NULL DEFAULT '[]',
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ErpVendorOrder_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ErpVendorOrder_vendorId_createdAt_idx" ON "ErpVendorOrder"("vendorId", "createdAt");
CREATE INDEX "ErpVendorOrder_status_idx" ON "ErpVendorOrder"("status");
