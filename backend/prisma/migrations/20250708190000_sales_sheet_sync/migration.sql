-- CreateTable
CREATE TABLE "ErpSalesInquiry" (
    "id" TEXT NOT NULL,
    "externalKey" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "spreadsheetId" TEXT NOT NULL,
    "sheetRow" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErpSalesInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpSalesOrder" (
    "id" TEXT NOT NULL,
    "externalKey" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "spreadsheetId" TEXT NOT NULL,
    "sheetRow" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErpSalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpSalesSyncLog" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "spreadsheetId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "added" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "deleted" INTEGER NOT NULL DEFAULT 0,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "syncedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErpSalesSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ErpSalesInquiry_spreadsheetId_sheetName_externalKey_key" ON "ErpSalesInquiry"("spreadsheetId", "sheetName", "externalKey");

-- CreateIndex
CREATE INDEX "ErpSalesInquiry_sheetName_idx" ON "ErpSalesInquiry"("sheetName");

-- CreateIndex
CREATE INDEX "ErpSalesInquiry_spreadsheetId_sheetName_idx" ON "ErpSalesInquiry"("spreadsheetId", "sheetName");

-- CreateIndex
CREATE UNIQUE INDEX "ErpSalesOrder_spreadsheetId_sheetName_externalKey_key" ON "ErpSalesOrder"("spreadsheetId", "sheetName", "externalKey");

-- CreateIndex
CREATE INDEX "ErpSalesOrder_sheetName_idx" ON "ErpSalesOrder"("sheetName");

-- CreateIndex
CREATE INDEX "ErpSalesOrder_spreadsheetId_sheetName_idx" ON "ErpSalesOrder"("spreadsheetId", "sheetName");

-- CreateIndex
CREATE INDEX "ErpSalesSyncLog_kind_sheetName_createdAt_idx" ON "ErpSalesSyncLog"("kind", "sheetName", "createdAt");
