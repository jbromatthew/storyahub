-- 즐겨찾기 — 사람마다 따로
CREATE TABLE "ErpRndStar" (
    "id" TEXT NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErpRndStar_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ErpRndStar_ticketId_email_key" ON "ErpRndStar"("ticketId", "email");
CREATE INDEX "ErpRndStar_email_idx" ON "ErpRndStar"("email");

ALTER TABLE "ErpRndStar" ADD CONSTRAINT "ErpRndStar_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "ErpRndTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
