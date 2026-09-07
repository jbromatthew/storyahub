-- RND 백로그 빠른검색(세그먼트)
CREATE TABLE "ErpRndSegment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "ownerEmail" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL DEFAULT '',
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErpRndSegment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ErpRndSegment_ownerEmail_idx" ON "ErpRndSegment"("ownerEmail");
CREATE INDEX "ErpRndSegment_shared_idx" ON "ErpRndSegment"("shared");
