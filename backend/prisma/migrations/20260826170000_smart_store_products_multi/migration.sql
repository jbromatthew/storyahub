-- 관심 기술을 복수 선택으로 (단일 product → products 배열)
ALTER TABLE "ErpSmartStoreApply" ADD COLUMN "products" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "ErpSmartStoreApply" SET "products" = ARRAY["product"] WHERE "product" IS NOT NULL;
ALTER TABLE "ErpSmartStoreApply" DROP COLUMN "product";

-- 접수를 2단계로 분리: 시작 시 리드 정보(연락처 기준) → 신청 후 사업자번호·스마트상점 ID
ALTER TABLE "ErpSmartStoreApply" ALTER COLUMN "bizNo" DROP NOT NULL;
ALTER TABLE "ErpSmartStoreApply" ALTER COLUMN "centerName" DROP NOT NULL;

-- 연락처를 리드 식별 기준으로 (중복 연락처는 최신 1건만 남기고 정리)
DELETE FROM "ErpSmartStoreApply" a
  USING "ErpSmartStoreApply" b
  WHERE a."roundId" = b."roundId" AND a."phone" = b."phone" AND a."createdAt" < b."createdAt";
DROP INDEX IF EXISTS "ErpSmartStoreApply_roundId_bizNo_phone_key";
CREATE UNIQUE INDEX "ErpSmartStoreApply_roundId_phone_key" ON "ErpSmartStoreApply"("roundId", "phone");
