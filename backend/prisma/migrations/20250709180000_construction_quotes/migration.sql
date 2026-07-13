-- 공사(견적) 관리 모듈
CREATE TABLE "ErpConstructionItem" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "unitPrice" INTEGER NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ErpConstructionItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ErpConstructionApartment" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "partner" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ErpConstructionApartment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ErpConstructionQuote" (
  "id" TEXT NOT NULL,
  "apartmentId" TEXT,
  "title" TEXT,
  "lines" JSONB NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'before',
  "taxInvoiceIssued" BOOLEAN NOT NULL DEFAULT false,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ErpConstructionQuote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ErpConstructionQuote_status_idx" ON "ErpConstructionQuote"("status");

ALTER TABLE "ErpConstructionQuote" ADD CONSTRAINT "ErpConstructionQuote_apartmentId_fkey"
  FOREIGN KEY ("apartmentId") REFERENCES "ErpConstructionApartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
