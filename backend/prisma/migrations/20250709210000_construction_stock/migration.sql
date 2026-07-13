CREATE TABLE "ErpConstructionStock" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "unit" TEXT NOT NULL DEFAULT '개',
  "note" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ErpConstructionStock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ErpConstructionStockMove" (
  "id" TEXT NOT NULL,
  "stockId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'in',
  "qty" INTEGER NOT NULL DEFAULT 0,
  "unitPrice" INTEGER,
  "vatSeparate" BOOLEAN NOT NULL DEFAULT true,
  "memo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ErpConstructionStockMove_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ErpConstructionStockMove_stockId_idx" ON "ErpConstructionStockMove"("stockId");

ALTER TABLE "ErpConstructionStockMove" ADD CONSTRAINT "ErpConstructionStockMove_stockId_fkey"
  FOREIGN KEY ("stockId") REFERENCES "ErpConstructionStock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
