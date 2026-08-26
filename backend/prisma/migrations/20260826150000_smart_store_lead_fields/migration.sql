-- 리드 판별 항목 추가
ALTER TABLE "ErpSmartStoreApply" ADD COLUMN "product" TEXT;
ALTER TABLE "ErpSmartStoreApply" ADD COLUMN "industry" TEXT;
ALTER TABLE "ErpSmartStoreApply" ADD COLUMN "branchCount" TEXT;
ALTER TABLE "ErpSmartStoreApply" ADD COLUMN "isCustomer" BOOLEAN;

-- 스마트상점 ID는 신청 전이면 비어 있을 수 있음
ALTER TABLE "ErpSmartStoreApply" ALTER COLUMN "storeId" DROP NOT NULL;

-- 사업자번호가 '준비중'인 미오픈 센터가 여럿일 수 있어 연락처까지 묶어 중복 판정
DROP INDEX IF EXISTS "ErpSmartStoreApply_roundId_bizNo_key";
CREATE UNIQUE INDEX "ErpSmartStoreApply_roundId_bizNo_phone_key"
  ON "ErpSmartStoreApply"("roundId", "bizNo", "phone");
