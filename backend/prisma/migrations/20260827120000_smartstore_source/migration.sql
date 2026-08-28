-- 유입 경로 기록. 둘 다 nullable이라 파라미터 없이 들어온 기존 링크는 영향 없음.
ALTER TABLE "ErpSmartStoreApply" ADD COLUMN "source" TEXT;
ALTER TABLE "ErpSmartStoreApply" ADD COLUMN "sourceDetail" TEXT;
