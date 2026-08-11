-- CreateTable
CREATE TABLE "ErpMenuAccess" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'custom',
    "deptIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErpMenuAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpAccessLog" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hits" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ErpAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ErpMenuAccess_menuId_key" ON "ErpMenuAccess"("menuId");
CREATE UNIQUE INDEX "ErpAccessLog_email_date_key" ON "ErpAccessLog"("email", "date");
CREATE INDEX "ErpAccessLog_date_idx" ON "ErpAccessLog"("date");
CREATE INDEX "ErpAccessLog_email_idx" ON "ErpAccessLog"("email");
