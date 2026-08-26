CREATE TABLE "ErpSmartStoreRound" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "guidePath" TEXT NOT NULL,
    "deadline" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ErpSmartStoreRound_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ErpSmartStoreApply" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "bizNo" TEXT NOT NULL,
    "centerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "applyType" TEXT,
    "hasPrior" BOOLEAN,
    "priorType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ErpSmartStoreApply_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ErpSmartStoreRound_year_round_key" ON "ErpSmartStoreRound"("year", "round");
CREATE UNIQUE INDEX "ErpSmartStoreApply_roundId_bizNo_key" ON "ErpSmartStoreApply"("roundId", "bizNo");
CREATE INDEX "ErpSmartStoreApply_roundId_createdAt_idx" ON "ErpSmartStoreApply"("roundId", "createdAt");

ALTER TABLE "ErpSmartStoreApply" ADD CONSTRAINT "ErpSmartStoreApply_roundId_fkey"
  FOREIGN KEY ("roundId") REFERENCES "ErpSmartStoreRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
