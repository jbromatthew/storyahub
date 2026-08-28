-- 유입 경로는 세일즈/마케팅 두 갈래만 쓰기로 해 세부 컬럼을 걷어낸다.
-- 추가 직후 실사용 데이터가 없는 상태에서 제거한다.
ALTER TABLE "ErpSmartStoreApply" DROP COLUMN "sourceDetail";
