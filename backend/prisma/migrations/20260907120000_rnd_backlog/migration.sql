-- RND 백로그
CREATE TABLE "ErpRndDomain" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "sortIndex" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ErpRndDomain_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ErpRndDomain_name_key" ON "ErpRndDomain"("name");

CREATE TABLE "ErpRndTicket" (
  "id" SERIAL NOT NULL,
  "authorId" TEXT NOT NULL,
  "authorName" TEXT NOT NULL,
  "authorEmail" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "service" TEXT NOT NULL DEFAULT '',
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL DEFAULT '',
  "cxmType" TEXT NOT NULL DEFAULT '',
  "rndType" TEXT NOT NULL DEFAULT '',
  "ownerName" TEXT NOT NULL DEFAULT '',
  "plannerName" TEXT NOT NULL DEFAULT '',
  "centerName" TEXT NOT NULL DEFAULT '',
  "vip" BOOLEAN NOT NULL DEFAULT false,
  "vipNote" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'filed',
  "rejectNote" TEXT NOT NULL DEFAULT '',
  "plannedAt" TIMESTAMP(3),
  "devAt" TIMESTAMP(3),
  "doneAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ErpRndTicket_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ErpRndTicket_status_createdAt_idx" ON "ErpRndTicket"("status","createdAt");
CREATE INDEX "ErpRndTicket_authorEmail_idx" ON "ErpRndTicket"("authorEmail");
CREATE INDEX "ErpRndTicket_domain_status_idx" ON "ErpRndTicket"("domain","status");

CREATE TABLE "ErpRndTicketLog" (
  "id" TEXT NOT NULL,
  "ticketId" INTEGER NOT NULL,
  "byName" TEXT NOT NULL,
  "byEmail" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "before" TEXT NOT NULL DEFAULT '',
  "after" TEXT NOT NULL DEFAULT '',
  "memo" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ErpRndTicketLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ErpRndTicketLog_ticketId_createdAt_idx" ON "ErpRndTicketLog"("ticketId","createdAt");
ALTER TABLE "ErpRndTicketLog" ADD CONSTRAINT "ErpRndTicketLog_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "ErpRndTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
