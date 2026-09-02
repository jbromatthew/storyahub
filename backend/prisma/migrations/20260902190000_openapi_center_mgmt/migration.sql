-- OPEN API 센터관리: 접속 설정 · 발급 키 대장 · 작업 기록 · 센터 대장

CREATE TABLE "ErpOpenApiConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "baseUrl" TEXT NOT NULL DEFAULT '',
    "masterPrefix" TEXT NOT NULL DEFAULT '/BroJOpenAPI/v1',
    "masterToken" TEXT NOT NULL DEFAULT '',
    "sessionToken" TEXT NOT NULL DEFAULT '',
    "publicApiKey" TEXT NOT NULL DEFAULT '',
    "updatedBy" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ErpOpenApiConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ErpOpenApiKey" (
    "id" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "apiGrade" TEXT NOT NULL DEFAULT 'CENTER',
    "brandKey" INTEGER,
    "groupKey" INTEGER,
    "brandId" TEXT NOT NULL DEFAULT '',
    "groupId" TEXT NOT NULL DEFAULT '',
    "centerName" TEXT NOT NULL DEFAULT '',
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "groupKeys" JSONB NOT NULL DEFAULT '[]',
    "groupIds" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiredAt" TIMESTAMP(3),
    "issuedBy" TEXT NOT NULL DEFAULT '',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMP(3),
    "memo" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ErpOpenApiKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ErpOpenApiKey_keyId_key" ON "ErpOpenApiKey"("keyId");
CREATE INDEX "ErpOpenApiKey_status_idx" ON "ErpOpenApiKey"("status");
CREATE INDEX "ErpOpenApiKey_groupKey_idx" ON "ErpOpenApiKey"("groupKey");

CREATE TABLE "ErpOpenApiKeyLog" (
    "id" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "keyName" TEXT NOT NULL DEFAULT '',
    "centerName" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "before" TEXT NOT NULL DEFAULT '',
    "after" TEXT NOT NULL DEFAULT '',
    "detail" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ErpOpenApiKeyLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ErpOpenApiKeyLog_createdAt_idx" ON "ErpOpenApiKeyLog"("createdAt");
CREATE INDEX "ErpOpenApiKeyLog_keyId_idx" ON "ErpOpenApiKeyLog"("keyId");

CREATE TABLE "ErpOpenApiCenter" (
    "id" TEXT NOT NULL,
    "groupKey" INTEGER NOT NULL,
    "groupId" TEXT NOT NULL DEFAULT '',
    "brandKey" INTEGER,
    "brandId" TEXT NOT NULL DEFAULT '',
    "centerName" TEXT NOT NULL,
    "bizNo" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "memo" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ErpOpenApiCenter_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ErpOpenApiCenter_groupKey_key" ON "ErpOpenApiCenter"("groupKey");
CREATE INDEX "ErpOpenApiCenter_centerName_idx" ON "ErpOpenApiCenter"("centerName");
