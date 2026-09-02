-- 스마트상점 접수 수정 기록. 이전 값이 남지 않아 무엇이 바뀌었는지 확인할 수 없었다.
CREATE TABLE IF NOT EXISTS "ErpSmartStoreEditLog" (
    "id" TEXT NOT NULL,
    "applyId" TEXT NOT NULL,
    "roundLabel" TEXT NOT NULL,
    "center" TEXT NOT NULL,
    "editorEmail" TEXT NOT NULL,
    "editorName" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "before" TEXT NOT NULL,
    "after" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ErpSmartStoreEditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ErpSmartStoreEditLog_createdAt_idx" ON "ErpSmartStoreEditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "ErpSmartStoreEditLog_applyId_idx" ON "ErpSmartStoreEditLog"("applyId");
CREATE INDEX IF NOT EXISTS "ErpSmartStoreEditLog_editorEmail_idx" ON "ErpSmartStoreEditLog"("editorEmail");
