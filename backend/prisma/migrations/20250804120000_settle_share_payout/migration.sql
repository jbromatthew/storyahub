-- 팀별 지급 정산서 (차감·지급처 분배)
ALTER TABLE "ErpInstallSettleShare" ADD COLUMN "payout" JSONB;
