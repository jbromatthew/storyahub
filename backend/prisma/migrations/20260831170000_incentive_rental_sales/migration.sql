-- NBM은 이카운트 HW매출과 렌탈 매출 두 갈래로 입력한다.
ALTER TABLE "ErpIncentiveQuarter" ADD COLUMN IF NOT EXISTS "rentalSales" JSONB NOT NULL DEFAULT '[]';
