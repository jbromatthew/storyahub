-- 브로제이 설치일정 (앱 네이티브 관리, 시트 동기화 없음)
CREATE TABLE "ErpInstallSchedule" (
  "id" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "installDate" TEXT,
  "centerName" TEXT,
  "data" JSONB NOT NULL DEFAULT '{}',
  "sortIndex" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ErpInstallSchedule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ErpInstallSchedule_month_idx" ON "ErpInstallSchedule"("month");
