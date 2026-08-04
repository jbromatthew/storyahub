-- 정산 공유 범위 고정: 발급 시 선택한 기간만 설치팀에 노출
ALTER TABLE "ErpInstallSettleShare" ADD COLUMN "fromDate" TEXT;
ALTER TABLE "ErpInstallSettleShare" ADD COLUMN "toDate" TEXT;
