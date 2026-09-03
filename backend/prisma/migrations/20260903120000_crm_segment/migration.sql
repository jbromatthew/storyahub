-- 고객관리 센터조회 — 저장한 검색 조건(세그먼트)
CREATE TABLE "ErpCrmSegment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "ownerEmail" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL DEFAULT '',
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ErpCrmSegment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ErpCrmSegment_ownerEmail_idx" ON "ErpCrmSegment"("ownerEmail");
CREATE INDEX "ErpCrmSegment_shared_idx" ON "ErpCrmSegment"("shared");
