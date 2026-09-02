-- 성공사례를 지식경영 글(section = sales_case)로 쓰기로 해, 승인 필드를 KB에 얹는다.
ALTER TABLE "KbArticle" ADD COLUMN IF NOT EXISTS "cooApproved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "KbArticle" ADD COLUMN IF NOT EXISTS "cooAt" TIMESTAMP(3);

-- 별도 테이블은 쓰지 않는다 (사용 전, 0건)
DROP TABLE IF EXISTS "ErpSalesCase";
