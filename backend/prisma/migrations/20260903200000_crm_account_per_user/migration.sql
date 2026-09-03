-- ERP 사용자별 브로제이 CRM 계정
CREATE TABLE "ErpCrmAccount" (
    "id" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "memberPassword" TEXT NOT NULL DEFAULT '',
    "masterToken" TEXT NOT NULL DEFAULT '',
    "sessionToken" TEXT NOT NULL DEFAULT '',
    "tokenAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ErpCrmAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ErpCrmAccount_userEmail_key" ON "ErpCrmAccount"("userEmail");
