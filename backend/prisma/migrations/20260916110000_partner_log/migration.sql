-- 파트너 기록 — 미팅·통화·메모를 날짜별로
CREATE TABLE "ErpPartnerLog" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'note',
    "at" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "attendees" TEXT NOT NULL DEFAULT '',
    "place" TEXT NOT NULL DEFAULT '',
    "nextStep" TEXT NOT NULL DEFAULT '',
    "files" JSONB NOT NULL DEFAULT '[]',
    "authorName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErpPartnerLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ErpPartnerLog_partnerId_at_idx" ON "ErpPartnerLog"("partnerId", "at");

ALTER TABLE "ErpPartnerLog" ADD CONSTRAINT "ErpPartnerLog_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "ErpPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
