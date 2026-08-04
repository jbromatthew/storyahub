-- 설치팀 월별 정산 공유 (PIN 접속) + 금액 수정 요청
CREATE TABLE "ErpInstallSettleShare" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "pin" TEXT NOT NULL,
  "team" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ErpInstallSettleShare_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ErpInstallSettleShare_token_key" ON "ErpInstallSettleShare"("token");
CREATE INDEX "ErpInstallSettleShare_team_idx" ON "ErpInstallSettleShare"("team");
