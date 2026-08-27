-- 접수 단계를 명시적으로 기록한다. 사업자번호를 시작 폼에서도 받게 되면서
-- 사업자번호 유무로는 마지막 단계를 마쳤는지 알 수 없게 됐다.
ALTER TABLE "ErpSmartStoreApply" ADD COLUMN "stage" TEXT NOT NULL DEFAULT 'start';

-- 이미 스마트상점 ID를 낸 건은 마지막 단계까지 마친 것으로 본다
UPDATE "ErpSmartStoreApply" SET "stage" = 'done' WHERE "storeId" IS NOT NULL;
